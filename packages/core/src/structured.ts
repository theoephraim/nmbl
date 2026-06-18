import { parse as parseYaml } from 'yaml';
import { parseToAst } from './cst-to-ast.js';
import type { AstNode, ElementNode } from './ast.js';
import { createError, ErrorCode, type NmblError } from './errors.js';

// ---------------------------------------------------------------------------
// Structured-object output
//
// The 'prompt' compile target renders a `.nmbl` file to an XML-ish *string*.
// This module is the other consumption mode: parse the same file into a
// serializable tree + frontmatter, so a tool can load a folder of `.nmbl`
// documents and walk their structure (read attributes as metadata, pull each
// section's raw markdown) instead of rendering them.
//
// One source, two outputs: `compile(src, { framework: 'prompt' })` for the
// string, `parseStructured(src)` for the object.
// ---------------------------------------------------------------------------

/** An element node in the structured tree. */
export interface NmblElement {
  type: 'element';
  /** Tag name exactly as written (PascalCase preserved for components). */
  tag: string;
  /** True when the tag is a PascalCase component rather than a plain tag. */
  component: boolean;
  /**
   * Attributes as a flat map. CSS shorthand folds in (`#id` → `id`, `.a.b` →
   * `class: "a b"`). Boolean attributes (no value) become `true`. Bound/expression
   * attribute values are kept as their raw source text.
   */
  attrs: Record<string, string | true>;
  /**
   * Raw body of a content-mode element (`tag:md` → `{ mode: 'md', text }`),
   * dedented to column 0 with markdown preserved as text. Present instead of
   * `children` — the two are mutually exclusive.
   */
  content?: { mode: string; text: string };
  /** Child nodes. Empty for content-mode elements (their body is in `content`). */
  children: NmblTreeNode[];
}

/** A text node (inline text or `|` pipe text). */
export interface NmblText {
  type: 'text';
  value: string;
}

export type NmblTreeNode = NmblElement | NmblText;

export interface NmblDocument {
  /** Parsed YAML frontmatter (empty object when the file has none). */
  frontmatter: Record<string, unknown>;
  /** Top-level nodes of the document body. */
  tree: NmblTreeNode[];
  /**
   * The template body with frontmatter removed — pass to `compile(body, …)` to
   * render the same document to a string (e.g. `{ framework: 'prompt' }`).
   */
  body: string;
  /** Frontmatter (YAML) and template (parse) errors, if any. */
  errors: NmblError[];
}

/**
 * Split leading YAML frontmatter (`---\n…\n---`) off the source. Returns the raw
 * YAML (or null), a `blanked` body where the frontmatter region is replaced with
 * blank lines so parse errors keep the file's original line numbers, and a
 * `clean` body with the frontmatter removed outright (for rendering).
 */
function splitFrontmatter(src: string): { yaml: string | null; blanked: string; clean: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return { yaml: null, blanked: src, clean: src };
  const rest = src.slice(m[0].length);
  const blanks = m[0].replace(/[^\n]/g, '');
  return { yaml: m[1], blanked: blanks + rest, clean: rest };
}

const ZERO_SPAN = {
  start: { line: 0, column: 0, offset: 0 },
  end: { line: 0, column: 0, offset: 0 },
};

/** Flatten an element's attributes (shorthand + explicit) into a plain map. */
function elementAttrs(node: ElementNode): Record<string, string | true> {
  const attrs: Record<string, string | true> = {};
  if (node.id) attrs.id = node.id;
  if (node.classes.length) attrs.class = node.classes.join(' ');
  for (const attr of node.attributes) {
    // Boolean attribute (no value) → true; otherwise the raw value text.
    attrs[attr.name] = attr.value ?? true;
  }
  return attrs;
}

/** Map a content-mode element's raw text body, dedented and joined. */
function contentBody(node: ElementNode): string {
  return node.children
    .filter((c): c is Extract<AstNode, { type: 'Text' }> => c.type === 'Text')
    .map(c => c.value)
    .join('\n');
}

/**
 * Convert parser AST nodes into structured tree nodes. Elements and text carry
 * through; control-flow blocks, inline directives, and comments are dropped —
 * a structured document is static data, not a template.
 */
function mapNodes(nodes: AstNode[]): NmblTreeNode[] {
  const out: NmblTreeNode[] = [];
  for (const node of nodes) {
    if (node.type === 'Element') {
      const el: NmblElement = {
        type: 'element',
        tag: node.tagName,
        component: node.isComponent,
        attrs: elementAttrs(node),
        children: [],
      };
      if (node.contentMode) {
        el.content = { mode: node.contentMode, text: contentBody(node) };
      } else {
        el.children = mapNodes(node.children);
      }
      out.push(el);
    } else if (node.type === 'Text') {
      if (node.value.length > 0) out.push({ type: 'text', value: node.value });
    }
    // HtmlComment / Block / InlineDirective: intentionally omitted.
  }
  return out;
}

/**
 * Parse a `.nmbl` source into frontmatter + a structured tree. Pure (no I/O):
 * a folder loader is a thin `readFileSync` + `parseStructured` wrapper, kept
 * out of core so this module stays browser-safe.
 */
export function parseStructured(source: string): NmblDocument {
  const { yaml, blanked, clean } = splitFrontmatter(source);
  const errors: NmblError[] = [];

  let frontmatter: Record<string, unknown> = {};
  if (yaml !== null) {
    try {
      frontmatter = (parseYaml(yaml) as Record<string, unknown>) ?? {};
    } catch (e) {
      errors.push(createError(
        ErrorCode.InvalidFrontmatter,
        `frontmatter is not valid YAML: ${(e as Error).message}`,
        ZERO_SPAN,
      ));
    }
  }

  // Parse the blanked body so error line numbers match the original file.
  const { ast, errors: parseErrors } = parseToAst(blanked);
  errors.push(...parseErrors);

  return { frontmatter, tree: mapNodes(ast.children), body: clean, errors };
}
