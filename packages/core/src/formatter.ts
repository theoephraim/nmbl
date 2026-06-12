// formatter.ts — canonical pretty-printer for NMBL source.
//
// The formatter parses NMBL to the compiler AST, then re-emits canonical
// NMBL. It is the foundation every tooling integration builds on (the CLI,
// the Prettier plugin, the VS Code format-document command).
//
// Guarantees:
//   - **Never corrupts unparseable input.** If the source has parse errors,
//     `format` returns the original source untouched (with the errors), so a
//     format-on-save can never destroy work-in-progress.
//   - **Idempotent.** `format(format(x)) === format(x)`.
//   - **Semantics-preserving.** `compile(x)` and `compile(format(x))` produce
//     the same HTML for any framework target (covered by the test suite).
//   - **Comment-preserving.** Silent (`//`, `/* */`) and rendered (`//!`,
//     `/*! */`) comments survive, including comments inside attribute lists.
//
// Canonicalization the formatter performs:
//   - 2-space indentation (configurable), no tabs, trailing whitespace
//     stripped, single trailing newline.
//   - Selector order `tag#id.class.class`; implicit `div` dropped when an id
//     or class shorthand is present (`div.card` → `.card`).
//   - Attribute lists wrapped in `(…)` with single-space separation; wrapped
//     across lines when they exceed the print width or carry comments.
//   - Double-quoted attribute values (single quotes only when the value
//     contains a double quote but no single quote).
//   - `@each` normalized to the portable `item of items` form with `:key`.
//   - At most one consecutive blank line between siblings is preserved.
import { parseToAst } from './cst-to-ast.js';
import { recoverComments, type RecoveredComment } from './comments.js';
import type {
  DocumentNode, ElementNode, AttributeNode, TextNode, HtmlCommentNode,
  ContentBlockNode, BlockNode, BlockClauseNode, InlineDirectiveNode, AstNode,
} from './ast.js';
import type { NmblError } from './errors.js';

/** Compile target — drives target-idiomatic `@each` output. */
export type FormatFramework = 'html' | 'vue' | 'svelte' | 'astro' | 'jsx';

export interface FormatOptions {
  /** Indentation width in spaces (default: 2). */
  indent?: number;
  /** Column past which attribute lists wrap onto multiple lines (default: 100). */
  printWidth?: number;
  /**
   * Target framework. When `'svelte'`, `@each` is emitted in Svelte's native
   * `items as item (key)` form (matching `{#each items as item}`). For every
   * other target the portable `item of items :key="…"` form is used — which is
   * also what Vue/Astro/JSX compile from. Defaults to the portable form.
   */
  framework?: FormatFramework;
}

export interface FormatResult {
  /** Formatted NMBL (or the original source verbatim if it didn't parse). */
  code: string;
  /** Parse errors. When non-empty, `code` is the untouched input. */
  errors: NmblError[];
  /** True when formatting was applied (false when bailed on parse errors). */
  formatted: boolean;
}

/** Format NMBL source into canonical form. */
export function format(source: string, options: FormatOptions = {}): FormatResult {
  const { ast, errors } = parseToAst(source);
  // Never touch source we can't fully understand — a half-parsed AST would
  // silently drop the unparsed tail.
  if (errors.length > 0) {
    return { code: source, errors, formatted: false };
  }
  const comments = recoverComments(source);
  const code = new Formatter(source, comments, options).run(ast);
  return { code, errors: [], formatted: true };
}

class Formatter {
  private readonly indentUnit: string;
  private readonly printWidth: number;
  private readonly framework: FormatFramework;
  /** Comments not yet emitted, in source order. */
  private comments: RecoveredComment[];
  private out: string[] = [];

  constructor(
    private source: string,
    comments: RecoveredComment[],
    options: FormatOptions,
  ) {
    const indent = options.indent ?? 2;
    this.indentUnit = ' '.repeat(indent);
    this.printWidth = options.printWidth ?? 100;
    this.framework = options.framework ?? 'html';
    this.comments = [...comments];
  }

  run(ast: DocumentNode): string {
    this.emitChildren(ast.children, 0, 0, this.source.length);
    // Drain any trailing comments past the last node (handled by emitChildren's
    // closeOffset already, but guard the empty-document case).
    let text = this.out.join('\n');
    // Normalize: strip trailing whitespace per line, collapse 3+ blank lines,
    // ensure exactly one trailing newline.
    text = text
      .split('\n')
      .map((l) => l.replace(/[ \t]+$/, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+/, '')
      .replace(/\n+$/, '');
    return text.length ? text + '\n' : '';
  }

  private push(line: string): void {
    this.out.push(line);
  }

  private indent(depth: number): string {
    return this.indentUnit.repeat(depth);
  }

  // ── Sibling lists with interleaved trivia ───────────────────────────────
  //
  // `openOffset`/`closeOffset` bound the source region these siblings own
  // (the parent's content area). Comments and blank lines living in the gaps
  // between siblings are woven back in here.
  private emitChildren(nodes: AstNode[], depth: number, openOffset: number, closeOffset: number): void {
    let cursor = openOffset;
    for (const node of nodes) {
      const start = node.span.start.offset;
      this.emitGap(cursor, start, depth);
      const before = this.out.length;
      this.emitNode(node, depth);
      const nodeEnd = subtreeEnd(node);
      // Trailing same-line comment: a comment whose start is after the node
      // ends but before the next newline.
      this.attachTrailingComment(nodeEnd, before);
      cursor = Math.max(nodeEnd, this.consumedTo);
    }
    this.emitGap(cursor, closeOffset, depth);
  }

  /** High-water mark of source consumed by trailing-comment attachment. */
  private consumedTo = 0;

  // Emit own-line comments found in [from, to), preserving a single blank line
  // where the source had one.
  private emitGap(from: number, to: number, depth: number): void {
    if (to <= from) return;
    const ind = this.indent(depth);
    let prevEnd = from;
    while (this.comments.length && this.comments[0].offset < to && this.comments[0].offset >= from) {
      const c = this.comments[0];
      // Only treat as an own-line comment if nothing but whitespace precedes
      // it on its line (otherwise it's a trailing comment handled elsewhere).
      if (!this.atLineStart(c.offset)) break;
      this.comments.shift();
      // Blank line between previous content and this comment?
      if (blankBetween(this.source, prevEnd, c.offset)) this.push('');
      this.emitCommentLines(c, ind);
      prevEnd = c.end;
    }
    // Blank line between the last emitted thing and the upcoming node/close.
    if (blankBetween(this.source, prevEnd, to)) this.push('');
  }

  private attachTrailingComment(nodeEnd: number, lineStartIndex: number): void {
    this.consumedTo = nodeEnd;
    if (!this.comments.length) return;
    const c = this.comments[0];
    if (c.offset < nodeEnd) return;
    // Must be on the same source line as the node's end (no newline between).
    const gap = this.source.slice(nodeEnd, c.offset);
    if (gap.includes('\n') || gap.trim() !== '') return;
    if (this.out.length <= lineStartIndex) return;
    this.comments.shift();
    const last = this.out.length - 1;
    this.out[last] = this.out[last] + ' ' + this.normalizeComment(c).replace(/\n[\s\S]*/, '');
    this.consumedTo = c.end;
  }

  private atLineStart(offset: number): boolean {
    let i = offset - 1;
    while (i >= 0 && (this.source[i] === ' ' || this.source[i] === '\t')) i--;
    return i < 0 || this.source[i] === '\n';
  }

  private emitCommentLines(c: RecoveredComment, ind: string): void {
    const text = this.normalizeComment(c);
    for (const line of text.split('\n')) this.push(ind + line);
  }

  // Trim trailing whitespace from a line comment; leave block comments verbatim
  // (their internal layout may be significant).
  private normalizeComment(c: RecoveredComment): string {
    if (c.kind === 'line') return c.text.replace(/\s+$/, '');
    return c.text;
  }

  // ── Nodes ───────────────────────────────────────────────────────────────
  private emitNode(node: AstNode, depth: number): void {
    switch (node.type) {
      case 'Element': return this.emitElement(node, depth);
      case 'Text': return this.emitText(node, depth);
      case 'HtmlComment': return this.emitHtmlComment(node, depth);
      case 'ContentBlock': return this.emitContentBlock(node, depth);
      case 'Block': return this.emitBlock(node, depth);
      case 'InlineDirective': return this.emitInlineDirective(node, depth);
    }
  }

  private emitElement(node: ElementNode, depth: number): void {
    const ind = this.indent(depth);
    const selector = buildSelector(node);
    // Compute attributes exactly once (renderAttributes consumes attr-list
    // comments destructively).
    const { inline, wrapped } = this.renderAttributes(node, ind, selector.length);
    const head = selector + (wrapped ?? inline);

    // Content-mode element (`script:`, `style:`, `article:md`).
    if (node.contentMode) {
      this.push(ind + head + ':' + (node.contentMode === 'raw' ? '' : node.contentMode));
      this.emitRawBody(node, depth + 1);
      return;
    }

    const children = node.children;

    // Block expansion: `li > a(href="/") Home` — single element child inlined.
    // Only when this element's own attrs aren't wrapped across lines.
    if (!wrapped && node.isBlockExpansion && children.length === 1 && children[0].type === 'Element') {
      const childLine = this.renderInlineElement(children[0] as ElementNode);
      if (childLine !== null) {
        this.push(ind + head + ' > ' + childLine);
        return;
      }
    }

    // No children.
    if (children.length === 0) {
      this.push(ind + head);
      return;
    }

    // Single inline text child → `selector text`.
    if (children.length === 1 && children[0].type === 'Text' && !(children[0] as TextNode).value.includes('\n')) {
      const text = (children[0] as TextNode).value;
      this.push(ind + head + (text ? ' ' + text : ''));
      return;
    }

    // Element with nested children.
    this.push(ind + head);
    this.emitChildren(children, depth + 1, contentStart(node), subtreeEnd(node));
  }

  // Render a single element as an inline (single-line) string, or null if it
  // can't be expressed inline (has block children).
  private renderInlineElement(node: ElementNode): string | null {
    if (node.contentMode) return null;
    const selector = buildSelector(node);
    const { inline, wrapped } = this.renderAttributes(node, '', selector.length);
    if (wrapped) return null; // wrapped attrs can't sit inline
    const head = selector + inline;
    if (node.children.length === 0) return head;
    if (node.isBlockExpansion && node.children.length === 1 && node.children[0].type === 'Element') {
      const inner = this.renderInlineElement(node.children[0] as ElementNode);
      return inner === null ? null : head + ' > ' + inner;
    }
    if (node.children.length === 1 && node.children[0].type === 'Text' && !(node.children[0] as TextNode).value.includes('\n')) {
      const text = (node.children[0] as TextNode).value;
      return head + (text ? ' ' + text : '');
    }
    return null;
  }

  // ── Attributes ──────────────────────────────────────────────────────────
  // Returns the inline `(…)` form, and a wrapped multi-line form when wrapping
  // is needed (long lists or attr-internal comments).
  private renderAttributes(node: ElementNode, ind: string, selectorLen: number): { inline: string; wrapped: string | null } {
    if (node.attributes.length === 0) return { inline: '', wrapped: null };

    // Multi-line attribute values (arrays/objects/expressions spanning lines)
    // are host-language code we must NOT reflow. Preserve the entire `(…)`
    // slice verbatim, shifting only its indentation to track the element's
    // new column. This is what makes formatting idempotent on real SFCs.
    const verbatim = this.tryVerbatimAttrs(node, ind);
    if (verbatim !== null) return { inline: verbatim, wrapped: verbatim };

    const parts = node.attributes.map((a) => renderAttr(a));
    const single = '(' + parts.join(' ') + ')';

    // Comments living inside the paren list force a wrap.
    const attrComments = this.commentsInRange(attrListStart(node), attrListEnd(node));
    const tooLong = ind.length + selectorLen + single.length > this.printWidth;

    if (!attrComments.length && !tooLong) {
      return { inline: single, wrapped: null };
    }
    // Multi-line form (caller positions it relative to the selector).
    const innerInd = ind + this.indentUnit;
    const lines: string[] = ['('];
    // Interleave attributes and comments by source offset.
    const items = [
      ...node.attributes.map((a) => ({ off: a.span.start.offset, text: renderAttr(a) })),
      ...attrComments.map((c) => ({ off: c.offset, text: this.normalizeComment(c) })),
    ].sort((x, y) => x.off - y.off);
    for (const it of items) {
      for (const sub of it.text.split('\n')) lines.push(innerInd + sub);
    }
    lines.push(ind + ')');
    return { inline: single, wrapped: lines.join('\n') };
  }

  // When the original `(…)` spans multiple lines, return it verbatim with its
  // indentation shifted to the element's new column; otherwise null.
  private tryVerbatimAttrs(node: ElementNode, ind: string): string | null {
    const open = this.source.lastIndexOf('(', node.attributes[0].span.start.offset);
    if (open < 0) return null;
    let close = this.source.indexOf(')', node.attributes[node.attributes.length - 1].span.end.offset);
    if (close < 0) return null;
    const slice = this.source.slice(open, close + 1);
    if (!slice.includes('\n')) return null;

    // The comments inside live in the slice already — drop them from the
    // pending queue so they aren't re-emitted elsewhere.
    this.commentsInRange(open, close + 1);

    const shift = ind.length - node.span.start.column;
    const lines = slice.split('\n');
    return lines
      .map((line, i) => {
        if (i === 0) return line; // continues the selector line
        const lead = /^[ \t]*/.exec(line)![0].length;
        return ' '.repeat(Math.max(0, lead + shift)) + line.slice(lead);
      })
      .join('\n');
  }

  private commentsInRange(from: number, to: number): RecoveredComment[] {
    if (to <= from) return [];
    const taken: RecoveredComment[] = [];
    this.comments = this.comments.filter((c) => {
      if (c.offset >= from && c.end <= to) {
        taken.push(c);
        return false;
      }
      return true;
    });
    return taken;
  }

  // ── Text ──────────────────────────────────────────────────────────────
  private emitText(node: TextNode, depth: number): void {
    const ind = this.indent(depth);
    const value = node.value;
    // Raw HTML passthrough lines (`<!DOCTYPE html>`, `<div>`) stay bare.
    if (value.trimStart().startsWith('<')) {
      for (const line of value.split('\n')) {
        if (line.trim()) this.push(ind + line.trim());
      }
      return;
    }
    for (const line of value.split('\n')) {
      this.push(ind + '| ' + line.trimEnd());
    }
  }

  private emitHtmlComment(node: HtmlCommentNode, depth: number): void {
    const ind = this.indent(depth);
    if (node.isBlock) {
      const body = node.value;
      if (body.includes('\n')) {
        this.push(ind + '/*!');
        for (const line of body.split('\n')) this.push(ind + this.indentUnit + line);
        this.push(ind + '*/');
      } else {
        this.push(ind + '/*! ' + body.trim() + ' */');
      }
      return;
    }
    this.push(ind + '//! ' + node.value.trim());
  }

  private emitContentBlock(node: ContentBlockNode, depth: number): void {
    const ind = this.indent(depth);
    this.push(ind + ':' + (node.mode === 'raw' ? '' : node.mode));
    this.pushBody(node.body, depth + 1);
  }

  private emitRawBody(node: ElementNode, depth: number): void {
    const body = node.children
      .filter((c): c is TextNode => c.type === 'Text')
      .map((t) => t.value)
      .join('\n');
    this.pushBody(body, depth);
  }

  private pushBody(body: string, depth: number): void {
    if (!body.trim()) return;
    const ind = this.indent(depth);
    for (const line of body.replace(/\s+$/, '').split('\n')) {
      this.push(line.trim() ? ind + line : '');
    }
  }

  private emitInlineDirective(node: InlineDirectiveNode, depth: number): void {
    this.push(this.indent(depth) + `{@${node.directiveType} ${node.expression}}`);
  }

  // ── @-blocks ──────────────────────────────────────────────────────────
  private emitBlock(node: BlockNode, depth: number): void {
    const ind = this.indent(depth);
    node.clauses.forEach((clause, i) => {
      const head = i === 0
        ? this.blockHead(node)
        : this.clauseHead(clause);
      this.push(ind + head);
      const span = i === 0 ? node.clauses[0].span : clause.span;
      this.emitChildren(clause.children, depth + 1, span.start.offset, clauseEnd(clause));
    });
  }

  private blockHead(node: BlockNode): string {
    const kw = '@' + node.blockType;
    if (node.blockType === 'each' && node.each) {
      const { bindings, collection, key } = node.each;
      // Comma-separated bindings round-trip cleanly (top-level commas in the
      // expr re-split the same way); parenthesizing does not, so don't.
      let inner: string;
      if (this.framework === 'svelte') {
        // Svelte-native: `items as item, i (key)` — matches {#each items as item}.
        inner = `${collection} as ${bindings.join(', ')}`;
        if (key) inner += ` (${key})`;
      } else {
        // Portable form — also what Vue/Astro/JSX compile from.
        inner = `${bindings.join(', ')} of ${collection}`;
        if (key) inner += ` :key="${key}"`;
      }
      if (node.attributes?.length) inner += ' ' + node.attributes.map(renderAttr).join(' ');
      return `${kw}(${inner})`;
    }
    let inner = node.expression ?? '';
    if (node.attributes?.length) {
      inner += (inner ? ' ' : '') + node.attributes.map(renderAttr).join(' ');
    }
    return inner ? `${kw}(${inner})` : kw;
  }

  private clauseHead(clause: BlockClauseNode): string {
    const kw = CLAUSE_KEYWORD[clause.clauseType ?? ''] ?? '@' + (clause.clauseType ?? '');
    return clause.expression ? `${kw}(${clause.expression})` : kw;
  }
}

const CLAUSE_KEYWORD: Record<string, string> = {
  'else': '@else',
  'else if': '@elseif',
  'then': '@then',
  'catch': '@catch',
};

// ── Pure helpers ──────────────────────────────────────────────────────────

function buildSelector(node: ElementNode): string {
  let s = '';
  // Drop a redundant `div` whenever an id or class shorthand is present —
  // `div.card` and `.card` compile identically, and the implicit form is the
  // canonical NMBL brevity the language is built around.
  const dropDiv = node.tagName === 'div' && (node.id !== null || node.classes.length > 0);
  if (!node.isImplicitDiv && !dropDiv) s += node.tagName;
  if (node.id) s += '#' + node.id;
  for (const cls of node.classes) s += '.' + cls;
  if (!s) s = node.tagName; // bare div with neither id nor class
  return s;
}

function renderAttr(attr: AttributeNode): string {
  const prefix = attr.bound ? ':' : '';
  const name = prefix + attr.name;

  // Boolean attribute, or `:name` bound shorthand (value === name).
  if (attr.value === null) return name;
  if (attr.bound && attr.value === attr.name) return name;

  if (attr.expression) {
    // `={expr}` — value already includes the braces.
    return `${name}=${attr.value}`;
  }
  if (attr.templateLiteral) {
    return `${name}=\`${attr.value}\``;
  }
  // Regular string value — prefer double quotes.
  const quote = attr.value.includes('"') && !attr.value.includes("'") ? "'" : '"';
  return `${name}=${quote}${attr.value}${quote}`;
}

/** True when the source between [from,to) contains a fully blank line. */
function blankBetween(source: string, from: number, to: number): boolean {
  if (to <= from) return false;
  const slice = source.slice(from, to);
  // Two or more newlines with only whitespace between them ⇒ a blank line.
  return /\n[ \t]*\n/.test(slice);
}

// The offset where an element's nested-children content begins (just past the
// head line). We approximate with the element head span end; emitGap only
// looks for comments/blank lines, so a slightly loose start is harmless as
// long as it precedes the first child.
function contentStart(node: ElementNode): number {
  return node.span.end.offset;
}

function attrListStart(node: ElementNode): number {
  if (node.attributes.length === 0) return node.span.end.offset;
  return node.attributes[0].span.start.offset;
}

function attrListEnd(node: ElementNode): number {
  if (node.attributes.length === 0) return node.span.end.offset;
  return node.attributes[node.attributes.length - 1].span.end.offset;
}

function clauseEnd(clause: BlockClauseNode): number {
  let end = clause.span.end.offset;
  for (const child of clause.children) end = Math.max(end, subtreeEnd(child));
  return end;
}

/** Max source offset covered by a node and its entire subtree. */
function subtreeEnd(node: AstNode): number {
  let end = node.span.end.offset;
  switch (node.type) {
    case 'Element':
      for (const a of node.attributes) end = Math.max(end, a.span.end.offset);
      for (const c of node.children) end = Math.max(end, subtreeEnd(c));
      break;
    case 'Block':
      for (const clause of node.clauses) {
        end = Math.max(end, clause.span.end.offset);
        for (const c of clause.children) end = Math.max(end, subtreeEnd(c));
      }
      for (const a of node.attributes ?? []) end = Math.max(end, a.span.end.offset);
      break;
  }
  return end;
}
