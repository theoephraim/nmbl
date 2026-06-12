/**
 * nmbl:tagged-template — compile nmbl`…` tagged template literals to JSX.
 *
 * Exported pure functions for scanner + per-template transform so they can
 * be unit-tested directly without spinning up Vite.
 */

import { compile } from '@nmbl/parser';
import type { CompilerOptions } from '@nmbl/parser';
import MagicString from 'magic-string';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A hole found inside a tagged template: position in the OUTER code string. */
export interface TemplateHole {
  /** Absolute start of '${' in the outer code. */
  start: number;
  /** Absolute end (exclusive) of the closing '}'. */
  end: number;
  /** The inner expression text (between ${ and }). */
  expr: string;
}

/** A tagged-template literal found in the source file. */
export interface FoundTemplate {
  /** Absolute start of 'nmbl`' (the 'n'). */
  start: number;
  /** Absolute end (exclusive) of closing backtick. */
  end: number;
  /** Raw template body between the outer backticks (holes are ${…} runs). */
  content: string;
  /** Holes in absolute code offsets. */
  holes: TemplateHole[];
}

// ─── Scanner ─────────────────────────────────────────────────────────────────

/**
 * Scan `code` for occurrences of nmbl`…` and return their positions and
 * content.  Correctly skips:
 * - line comments  (// …)
 * - block comments (/* … *‌/)
 * - regular string literals (" " ' ')
 * - other template literals (` `)
 * - nmbl` inside any of the above
 *
 * Handles nested ${…} holes inside the found templates, including nested
 * strings and nested template literals inside holes.
 */
export function findNmblTemplates(code: string): FoundTemplate[] {
  const results: FoundTemplate[] = [];
  let i = 0;
  const len = code.length;

  // Top-level scanner modes
  type TopMode = 'code' | 'line_comment' | 'block_comment' | 'string_dq' | 'string_sq' | 'template';
  let mode: TopMode = 'code';

  // For top-level template literals (not nmbl ones) we track nesting depth so
  // we know when to pop back to 'code'.
  type TemplatePhase = 'template_body' | 'template_hole';
  interface TemplateState {
    phase: TemplatePhase;
    holeDepth: number; // brace depth inside current hole
  }
  const templateStack: TemplateState[] = [];

  while (i < len) {
    const ch = code[i];

    switch (mode) {
      // ── LINE COMMENT ──────────────────────────────────────────────────────
      case 'line_comment':
        if (ch === '\n') mode = 'code';
        i++;
        break;

      // ── BLOCK COMMENT ────────────────────────────────────────────────────
      case 'block_comment':
        if (ch === '*' && code[i + 1] === '/') { mode = 'code'; i += 2; }
        else i++;
        break;

      // ── DOUBLE-QUOTED STRING ─────────────────────────────────────────────
      case 'string_dq':
        if (ch === '\\') { i += 2; }
        else if (ch === '"') { mode = 'code'; i++; }
        else i++;
        break;

      // ── SINGLE-QUOTED STRING ─────────────────────────────────────────────
      case 'string_sq':
        if (ch === '\\') { i += 2; }
        else if (ch === "'") { mode = 'code'; i++; }
        else i++;
        break;

      // ── TOP-LEVEL TEMPLATE LITERAL (not nmbl`) ───────────────────────────
      case 'template': {
        const st = templateStack[templateStack.length - 1];
        if (st.phase === 'template_body') {
          if (ch === '\\') { i += 2; }
          else if (ch === '`') {
            // End of this template
            templateStack.pop();
            if (templateStack.length === 0) mode = 'code';
            i++;
          } else if (ch === '$' && code[i + 1] === '{') {
            st.phase = 'template_hole';
            st.holeDepth = 1;
            i += 2;
          } else {
            i++;
          }
        } else {
          // template_hole — track braces
          if (ch === '{') { st.holeDepth++; i++; }
          else if (ch === '}') {
            st.holeDepth--;
            i++;
            if (st.holeDepth === 0) st.phase = 'template_body';
          } else if (ch === '"') { mode = 'string_dq'; i++; }
          else if (ch === "'") { mode = 'string_sq'; i++; }
          else if (ch === '`') {
            // Nested template inside a top-level template hole
            templateStack.push({ phase: 'template_body', holeDepth: 0 });
            i++;
          } else {
            i++;
          }
        }
        break;
      }

      // ── CODE ─────────────────────────────────────────────────────────────
      case 'code': {
        if (ch === '/' && code[i + 1] === '/') { mode = 'line_comment'; i += 2; break; }
        if (ch === '/' && code[i + 1] === '*') { mode = 'block_comment'; i += 2; break; }
        if (ch === '"') { mode = 'string_dq'; i++; break; }
        if (ch === "'") { mode = 'string_sq'; i++; break; }

        // Detect nmbl` — must not be preceded by identifier chars
        if (
          ch === 'n' &&
          code[i + 1] === 'm' &&
          code[i + 2] === 'b' &&
          code[i + 3] === 'l' &&
          code[i + 4] === '`'
        ) {
          const before = i > 0 ? code[i - 1] : '';
          const isIdentContinue = /[A-Za-z0-9_$.]/.test(before);
          if (!isIdentContinue) {
            // Found a nmbl` — parse the template
            const tagStart = i;
            i += 5; // skip 'nmbl`'
            const tmpl = parseNmblTemplate(code, i, tagStart);
            if (tmpl) {
              results.push(tmpl);
              i = tmpl.end;
            }
            // Stay in code mode after consuming the template
            break;
          }
        }

        // Regular backtick opens a non-nmbl template literal
        if (ch === '`') {
          mode = 'template';
          templateStack.push({ phase: 'template_body', holeDepth: 0 });
          i++;
          break;
        }

        i++;
        break;
      }
    }
  }

  return results;
}

/**
 * Starting at `bodyStart` (the character right after the opening backtick of
 * nmbl`), scan to find the end of the template and extract holes.
 */
function parseNmblTemplate(code: string, bodyStart: number, tagStart: number): FoundTemplate | null {
  const len = code.length;
  let i = bodyStart;
  let content = '';
  const holes: TemplateHole[] = [];

  while (i < len) {
    const ch = code[i];

    if (ch === '\\') {
      // Escape — keep both chars in content
      content += code[i] + (i + 1 < len ? code[i + 1] : '');
      i += 2;
      continue;
    }

    if (ch === '`') {
      // End of template
      return {
        start: tagStart,
        end: i + 1,
        content,
        holes,
      };
    }

    if (ch === '$' && code[i + 1] === '{') {
      const holeStart = i;
      i += 2; // skip '${'
      const { expr, end } = parseHoleExpr(code, i);
      holes.push({ start: holeStart, end, expr });
      // Insert placeholder into content (will be used later)
      content += `__NMBL_X${holes.length - 1}__`;
      i = end;
      continue;
    }

    content += ch;
    i++;
  }

  // Unterminated template — skip
  return null;
}

/**
 * Parse a hole expression starting right after the '${'.
 * Returns the expression text and the position AFTER the closing '}'.
 */
function parseHoleExpr(code: string, start: number): { expr: string; end: number } {
  const len = code.length;
  let i = start;
  let depth = 1;
  let expr = '';

  // Mode stack for strings inside holes
  type HoleMode = 'code' | 'string_dq' | 'string_sq' | 'template';
  let mode: HoleMode = 'code';
  interface HoleTemplateState {
    phase: 'body' | 'hole';
    holeDepth: number;
  }
  const tmplStack: HoleTemplateState[] = [];

  while (i < len) {
    const ch = code[i];

    switch (mode) {
      case 'string_dq':
        if (ch === '\\') { expr += code[i] + (code[i + 1] ?? ''); i += 2; }
        else if (ch === '"') { expr += ch; mode = 'code'; i++; }
        else { expr += ch; i++; }
        break;

      case 'string_sq':
        if (ch === '\\') { expr += code[i] + (code[i + 1] ?? ''); i += 2; }
        else if (ch === "'") { expr += ch; mode = 'code'; i++; }
        else { expr += ch; i++; }
        break;

      case 'template': {
        const st = tmplStack[tmplStack.length - 1];
        if (st.phase === 'body') {
          if (ch === '\\') { expr += code[i] + (code[i + 1] ?? ''); i += 2; }
          else if (ch === '`') {
            expr += ch; i++;
            tmplStack.pop();
            if (tmplStack.length === 0) mode = 'code';
          } else if (ch === '$' && code[i + 1] === '{') {
            expr += '${';
            i += 2;
            st.phase = 'hole';
            st.holeDepth = 1;
          } else { expr += ch; i++; }
        } else {
          // inside nested template hole
          if (ch === '{') { st.holeDepth++; expr += ch; i++; }
          else if (ch === '}') {
            st.holeDepth--;
            expr += ch; i++;
            if (st.holeDepth === 0) st.phase = 'body';
          } else if (ch === '"') { expr += ch; mode = 'string_dq'; i++; }
          else if (ch === "'") { expr += ch; mode = 'string_sq'; i++; }
          else if (ch === '`') { expr += ch; tmplStack.push({ phase: 'body', holeDepth: 0 }); i++; }
          else { expr += ch; i++; }
        }
        break;
      }

      case 'code':
        if (ch === '{') { depth++; expr += ch; i++; }
        else if (ch === '}') {
          depth--;
          if (depth === 0) return { expr, end: i + 1 };
          expr += ch; i++;
        } else if (ch === '"') { expr += ch; mode = 'string_dq'; i++; }
        else if (ch === "'") { expr += ch; mode = 'string_sq'; i++; }
        else if (ch === '`') {
          expr += ch;
          mode = 'template';
          tmplStack.push({ phase: 'body', holeDepth: 0 });
          i++;
        } else { expr += ch; i++; }
        break;
    }
  }

  // Unterminated
  return { expr, end: i };
}

// ─── Dedent ───────────────────────────────────────────────────────────────────

/** Strip common leading indentation (same logic as in index.ts). */
function dedent(src: string): string {
  const lines = src.split('\n');
  let min = Infinity;
  for (const l of lines) {
    if (!l.trim()) continue;
    const indent = l.match(/^[ \t]*/)![0].length;
    if (indent < min) min = indent;
  }
  if (!isFinite(min) || min === 0) return src;
  return lines.map(l => (l.trim() ? l.slice(min) : l)).join('\n');
}

// ─── Placeholder substitution ─────────────────────────────────────────────────

/**
 * Given compiled JSX output and an array of hole expressions, substitute
 * `__NMBL_X<i>__` placeholders back in.
 *
 * Three positions:
 *  1. Quoted attr value:  `="__NMBL_X0__"` → `={expr}`
 *  2. Text node:          `__NMBL_X0__` (standalone in text) → `{expr}`
 *  3. Already in braces:  `{…__NMBL_X0__…}` → raw `expr`
 *     (the placeholder is inside a JSX expression already — rare but possible
 *      when an @if/@each expression contained a hole)
 */
function substitutePlaceholders(jsx: string, exprs: string[]): string {
  for (let idx = 0; idx < exprs.length; idx++) {
    const ph = `__NMBL_X${idx}__`;
    const expr = exprs[idx];

    // Pass 1: `="__NMBL_Xi__"` → `={expr}`
    jsx = jsx.split(`="${ph}"`).join(`={${expr}}`);

    // Pass 2: any remaining `__NMBL_Xi__` — check context
    let out = '';
    let pos = 0;
    while (true) {
      const found = jsx.indexOf(ph, pos);
      if (found === -1) { out += jsx.slice(pos); break; }

      out += jsx.slice(pos, found);
      // Determine whether the placeholder is already inside a { } expression
      // by scanning backward from `found` in `jsx` for unbalanced braces.
      const inside = isInsideBraces(jsx, found);
      if (inside) {
        out += expr;
      } else {
        out += `{${expr}}`;
      }
      pos = found + ph.length;
    }
    jsx = out;
  }
  return jsx;
}

/**
 * Return true if `pos` in `str` is inside an open JSX expression `{…}`.
 * We scan backward from pos counting braces while skipping strings.
 */
function isInsideBraces(str: string, pos: number): boolean {
  let depth = 0;
  let i = pos - 1;
  // Quick backward scan — skip strings lazily (this is emitted JSX, so we
  // won't hit complex nesting; a simple brace counter is fine here).
  while (i >= 0) {
    const ch = str[i];
    if (ch === '}') depth++;
    else if (ch === '{') {
      if (depth === 0) return true;
      depth--;
    }
    i--;
  }
  return false;
}

// ─── Root detection / fragment wrapping ───────────────────────────────────────

/**
 * Pragmatic root detection: count top-level "nodes" in the JSX string.
 * A node is either:
 *  - an element/fragment starting with '<' at zero brace+angle depth
 *  - a JSX expression starting with '{' at zero depth
 *
 * If there is exactly one, no fragment wrapper is needed.
 * Otherwise wrap in `(<>…</>)`.
 */
function countJsxRoots(jsx: string): number {
  let roots = 0;
  let angleBracketDepth = 0;
  let braceDepth = 0;
  let i = 0;
  const len = jsx.length;
  let inRoot = false;

  while (i < len) {
    const ch = jsx[i];

    // Skip whitespace between roots
    if (!inRoot && /\s/.test(ch)) { i++; continue; }

    if (braceDepth === 0 && angleBracketDepth === 0) {
      if (ch === '<') {
        const isClose = jsx[i + 1] === '/';
        if (isClose) {
          // closing tag at top level means the previous open tag is done
          // skip to end of this closing tag
          const gt = jsx.indexOf('>', i);
          i = gt >= 0 ? gt + 1 : len;
          inRoot = false;
          continue;
        }
        if (!inRoot) { roots++; inRoot = true; }
        angleBracketDepth++;
        i++;
        continue;
      }
      if (ch === '{') {
        if (!inRoot) { roots++; inRoot = true; }
        braceDepth++;
        i++;
        continue;
      }
    }

    if (ch === '<') {
      if (jsx[i + 1] === '/') {
        // closing tag
        angleBracketDepth = Math.max(0, angleBracketDepth - 1);
        const gt = jsx.indexOf('>', i);
        i = gt >= 0 ? gt + 1 : len;
        if (angleBracketDepth === 0 && braceDepth === 0) inRoot = false;
        continue;
      }
      // Check for self-closing: scan ahead for '/>'
      // We just need to track depth going up
      angleBracketDepth++;
      i++;
      continue;
    }

    if (ch === '/' && jsx[i + 1] === '>') {
      // self-closing tag
      angleBracketDepth = Math.max(0, angleBracketDepth - 1);
      i += 2;
      if (angleBracketDepth === 0 && braceDepth === 0) inRoot = false;
      continue;
    }

    if (ch === '>') {
      // Could be end of open tag — reduce depth? No, opening tag end is '>'
      // but we don't know if it's a self-close or open. Track by name.
      // For this heuristic, just reduce depth when we see '>' at top angle level
      if (angleBracketDepth > 0) angleBracketDepth--;
      i++;
      continue;
    }

    if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      if (angleBracketDepth === 0 && braceDepth === 0) inRoot = false;
      i++;
      continue;
    }

    i++;
  }

  return roots;
}

/**
 * Pragmatic root detection: if the compiled JSX has a single top-level
 * element or expression, do NOT wrap.  Otherwise wrap in `(<>…</>)`.
 */
function wrapIfNeeded(jsx: string): string {
  const trimmed = jsx.trim();

  // Quick path: starts with '{' (block/expression root) → always fragment-wrap
  if (trimmed.startsWith('{')) {
    return `(\n<>\n${jsx}\n</>)`;
  }

  // Count lines that start at top-level with '<' or '{' to detect multi-root
  // Use our root counter
  if (countJsxRoots(trimmed) <= 1) {
    return `(\n${jsx}\n)`;
  }

  return `(\n<>\n${jsx}\n</>)`;
}

// ─── Per-template compiler ────────────────────────────────────────────────────

export interface CompileTemplateOptions {
  attributeAliases?: Record<string, string>;
}

export type CompileTemplateResult =
  | { code: string; error?: undefined }
  | { error: string; code?: undefined };

/**
 * Compile one template's content with placeholders standing in for holes,
 * then re-substitute the real expressions back.
 *
 * `holeExprs` — the string expressions for each ${…} hole in order.
 */
export function compileTemplate(
  content: string,
  holeExprs: string[],
  opts: CompileTemplateOptions = {},
): CompileTemplateResult {
  const compilerOpts: CompilerOptions = {
    framework: 'jsx',
    attributeAliases: opts.attributeAliases,
  };

  const dedented = dedent(content.replace(/^\n/, ''));
  const { html, errors } = compile(dedented, compilerOpts);

  if (errors.length > 0) {
    const msgs = errors
      .map(e => `${e.message} (${e.span.start.line + 1}:${e.span.start.column + 1})`)
      .join('; ');
    return { error: msgs };
  }

  const jsx = substitutePlaceholders(html, holeExprs);
  const wrapped = wrapIfNeeded(jsx);
  return { code: wrapped };
}

// ─── Attribute aliases ────────────────────────────────────────────────────────

export const REACT_ALIASES: Record<string, string> = {
  class: 'className',
  for: 'htmlFor',
};

// ─── Vite sub-plugin ──────────────────────────────────────────────────────────

import type { Plugin } from 'vite';

export interface JsxOptions {
  framework?: 'react' | 'solid' | 'qwik' | 'preact';
}

export function taggedTemplatePlugin(jsxOpts: JsxOptions = {}): Plugin {
  const framework = jsxOpts.framework ?? 'react';
  const attributeAliases = framework === 'react' ? REACT_ALIASES : undefined;

  return {
    name: 'nmbl:tagged-template',
    enforce: 'pre',

    transform(code, id) {
      // Strip query string
      const plainId = id.split('?')[0];

      // Only handle JS/TS/JSX/TSX
      if (!/\.(jsx|tsx|js|ts|mjs|mts)$/.test(plainId)) return;

      // Quick bail-out
      if (!code.includes('nmbl`')) return;

      const templates = findNmblTemplates(code);
      if (templates.length === 0) return;

      const s = new MagicString(code);

      for (const tmpl of templates) {
        const holeExprs = tmpl.holes.map(h => h.expr);
        const result = compileTemplate(tmpl.content, holeExprs, { attributeAliases });
        if (result.error) {
          this.error(`NMBL tagged template compilation failed:\n${result.error}`);
          return;
        }
        s.overwrite(tmpl.start, tmpl.end, result.code!);
      }

      return {
        code: s.toString(),
        map: s.generateMap({ hires: 'boundary' }),
      };
    },
  };
}
