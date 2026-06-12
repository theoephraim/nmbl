// cst-to-ast.ts — adapts monogram's lossless CST into NMBL's compiler AST.
// The monogram grammar (nmbl-grammar.ts) is the single source of truth for
// syntax; this adapter carries its parse result into the AST shape the
// battle-tested compiler (compiler.ts) consumes. Replaces the hand-written
// lexer.ts / parser.ts pair.
import { createLexer } from 'monogram/src/gen-lexer.ts';
import { createParser } from 'monogram/src/gen-parser.ts';
import grammar from './nmbl-grammar.ts';
import type {
  DocumentNode, ElementNode, AttributeNode, AstNode, TextNode,
  BlockNode, BlockClauseNode, EachExpr,
} from './ast.js';
import type { SourcePosition, SourceSpan } from './source-location.js';
import { ErrorCode, createError, type NmblError } from './errors.js';
import { VOID_ELEMENTS } from './constants.js';

const { tokenize: monogramTokenize } = createLexer(grammar as any);
const { parse: monogramParse } = createParser(grammar as any);

/** A lexed token (monogram token stream, structurally typed). */
export interface NmblToken {
  /** Token type name ('' for punctuation literals). */
  type: string;
  text: string;
  offset: number;
}

// ── CST shapes (structurally typed; monogram has no exported d.ts build) ──
interface CstLeaf { tokenType: string; offset: number; end: number }
interface CstNode { rule: string; children: CstChild[]; offset: number; end: number }
type CstChild = CstNode | CstLeaf;

const isNode = (c: CstChild): c is CstNode => 'rule' in c;
const isLeaf = (c: CstChild): c is CstLeaf => 'tokenType' in c;

// Clause keywords that CONTINUE the preceding @-block rather than open one.
const CONTINUATION_CLAUSES: Record<string, string> = {
  else: 'else',
  elseif: 'else if',
  then: 'then',
  catch: 'catch',
};

export interface ParseToAstResult {
  ast: DocumentNode;
  errors: NmblError[];
  /** The raw monogram CST (null when the parse failed hard). */
  cst: CstNode | null;
}

export function tokenizeSource(source: string): NmblToken[] {
  return monogramTokenize(source) as NmblToken[];
}

export function parseToAst(source: string): ParseToAstResult {
  const ctx = new AdaptContext(source);
  let cst: CstNode | null = null;
  try {
    cst = monogramParse(source) as CstNode | null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // monogram reports "Parse error at offset N … [farthest: offset M near 'x']"
    const far = msg.match(/farthest: offset (\d+)/) ?? msg.match(/offset (\d+)/);
    const offset = far ? Number(far[1]) : 0;
    ctx.errors.push(createError(
      ErrorCode.UnexpectedToken,
      msg,
      { start: ctx.pos(offset), end: ctx.pos(Math.min(offset + 1, source.length)) },
    ));
  }

  const children = cst ? ctx.adaptLines(findRule(cst, 'Lines')) : [];
  const ast: DocumentNode = {
    type: 'Document',
    children,
    span: ctx.span(0, source.length),
  };
  return { ast, errors: ctx.errors, cst };
}

function findRule(node: CstNode, rule: string): CstNode | null {
  if (node.rule === rule) return node;
  for (const c of node.children) {
    if (isNode(c)) {
      if (c.rule === rule) return c;
      // Only descend through transparent single-purpose wrappers (Document).
      if (c.rule === 'Document') return findRule(c, rule);
    }
  }
  return null;
}

class AdaptContext {
  errors: NmblError[] = [];
  private lineStarts: number[] = [0];

  constructor(private source: string) {
    for (let i = 0; i < source.length; i++) {
      if (source[i] === '\n') this.lineStarts.push(i + 1);
    }
  }

  text(c: { offset: number; end: number }): string {
    return this.source.slice(c.offset, c.end);
  }

  pos(offset: number): SourcePosition {
    // binary search the line index
    let lo = 0, hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return { line: lo, column: offset - this.lineStarts[lo], offset };
  }

  span(start: number, end: number): SourceSpan {
    return { start: this.pos(start), end: this.pos(end) };
  }

  spanOf(c: { offset: number; end: number }): SourceSpan {
    return this.span(c.offset, c.end);
  }

  // ── Lines: a run of sibling Line nodes; @-clause lines fold into the
  //    preceding BlockNode here. ──
  adaptLines(lines: CstNode | null): AstNode[] {
    if (!lines) return [];
    const out: AstNode[] = [];
    for (const c of lines.children) {
      if (!isNode(c) || c.rule !== 'Line') continue;
      const node = this.adaptLine(c);
      if (!node) continue;
      // Fold continuation clauses (@else / @elseif / @then / @catch) into the
      // preceding block.
      if (node.type === 'Block' && node.blockType in CONTINUATION_CLAUSES) {
        const prev = out[out.length - 1];
        if (prev && prev.type === 'Block') {
          const clause: BlockClauseNode = {
            type: 'BlockClause',
            clauseType: CONTINUATION_CLAUSES[node.blockType],
            expression: node.expression,
            children: node.clauses[0]?.children ?? [],
            span: node.span,
          };
          (prev as BlockNode).clauses.push(clause);
          continue;
        }
        this.errors.push(createError(
          ErrorCode.UnexpectedToken,
          `@${node.blockType} without a preceding block`,
          node.span,
        ));
        continue;
      }
      out.push(node);
    }
    return out;
  }

  adaptLine(line: CstNode): AstNode | null {
    const c = line.children[0];
    if (!c) return null;
    if (isNode(c)) {
      switch (c.rule) {
        case 'AtBlock': return this.adaptAtBlock(c);
        case 'PipeText': return this.adaptPipeText(c);
        case 'Element': return this.adaptElement(c);
        case 'TextSoup': return this.adaptStandaloneText(c);
      }
      return null;
    }
    switch (c.tokenType) {
      case 'RenderedComment': {
        const value = this.text(c).replace(/^\/\/!\s?/, '');
        return { type: 'HtmlComment', value, isBlock: false, span: this.spanOf(c) };
      }
      case 'RenderedBlockComment': {
        const raw = this.text(c).replace(/^\/\*!\s?/, '').replace(/\s?\*\/$/, '');
        const value = dedentBlock(raw);
        return { type: 'HtmlComment', value, isBlock: true, span: this.spanOf(c) };
      }
      case 'RawContent': {
        const { mode, body } = splitRawContent(this.text(c));
        return { type: 'ContentBlock', mode, body, span: this.spanOf(c) };
      }
    }
    return null;
  }

  // ── Elements ──
  adaptElement(el: CstNode): ElementNode {
    const kids = el.children;
    const head = kids.find((k): k is CstNode => isNode(k) && k.rule === 'TagHead')!;

    let tagName = 'div';
    let isImplicitDiv = true;
    let id: string | null = null;
    let idSpan: SourceSpan | undefined;
    const classes: string[] = [];
    const classSpans: SourceSpan[] = [];

    for (const h of head.children) {
      if (!isLeaf(h)) continue;
      const t = this.text(h);
      if (h.tokenType === 'TagName' || h.tokenType === 'ComponentName') {
        tagName = t;
        isImplicitDiv = false;
      } else if (h.tokenType === 'IdSel') {
        if (id !== null) {
          this.errors.push(createError(ErrorCode.DuplicateId, `Duplicate id shorthand '#${t.slice(1)}'`, this.spanOf(h)));
        } else {
          id = t.slice(1);
          // span of the NAME (without '#') — compiler re-adds the prefix char
          idSpan = this.span(h.offset + 1, h.end);
        }
      } else if (h.tokenType === 'ClassSel') {
        classes.push(t.slice(1));
        classSpans.push(this.span(h.offset + 1, h.end));
      }
    }

    const attrList = kids.find((k): k is CstNode => isNode(k) && k.rule === 'AttrList');
    const attributes = attrList ? this.adaptAttrs(attrList) : [];

    const children: AstNode[] = [];
    let isBlockExpansion = false;
    let contentMode: string | null = null;

    // Raw content block glued to this element (`script:` / `article:md`)
    const raw = kids.find((k): k is CstLeaf => isLeaf(k) && k.tokenType === 'RawContent');
    if (raw) {
      const { mode, body } = splitRawContent(this.text(raw));
      contentMode = mode || 'raw';
      if (body) {
        children.push({
          type: 'Text', value: body, preserveTrailingWhitespace: false,
          span: this.spanOf(raw),
        } satisfies TextNode);
      }
    }

    // Block expansion: `li > a(...) Home`
    const gtIdx = kids.findIndex(k => isLeaf(k) && k.tokenType === '$punct' && this.text(k) === '>');
    const childEl = kids.find((k): k is CstNode => isNode(k) && k.rule === 'Element');
    if (gtIdx >= 0 && childEl) {
      isBlockExpansion = true;
      children.push(this.adaptElement(childEl));
    }

    // Inline text
    const soup = kids.find((k): k is CstNode => isNode(k) && k.rule === 'TextSoup');
    if (soup) {
      const node = this.adaptText(soup);
      if (node) children.push(node);
    }

    // Indented children
    const lines = kids.find((k): k is CstNode => isNode(k) && k.rule === 'Lines');
    if (lines) children.push(...this.adaptLines(lines));

    const isVoid = VOID_ELEMENTS.has(tagName.toLowerCase());
    if (isVoid && children.length > 0) {
      this.errors.push(createError(
        ErrorCode.VoidElementWithChildren,
        `Void element <${tagName}> cannot have children`,
        this.spanOf(el),
      ));
    }

    return {
      type: 'Element',
      tagName,
      isComponent: /^[A-Z]/.test(tagName),
      isVoid,
      isImplicitDiv,
      isBlockExpansion,
      id, idSpan,
      classes, classSpans,
      attributes,
      children,
      contentMode,
      span: this.spanOf(head),
    };
  }

  // ── Attributes ──
  adaptAttrs(attrList: CstNode): AttributeNode[] {
    const out: AttributeNode[] = [];
    for (const c of attrList.children) {
      if (!isNode(c) || c.rule !== 'Attr') continue;
      out.push(this.adaptAttr(c));
    }
    return out;
  }

  adaptAttr(attr: CstNode): AttributeNode {
    const nameLeaf = attr.children.find((k): k is CstLeaf => isLeaf(k) && k.tokenType === 'AttrName')!;
    let name = this.text(nameLeaf);
    const bound = name.startsWith(':');
    if (bound) name = name.slice(1);

    const valueNode = attr.children.find((k): k is CstNode => isNode(k) && k.rule === 'AttrValue');
    const span = this.spanOf(attr);

    if (!valueNode) {
      // boolean attribute, or `:name` bound shorthand (value = name)
      return {
        type: 'Attribute', name,
        value: bound ? name : null,
        bound, templateLiteral: false, expression: false, span,
      };
    }

    const v = valueNode.children[0];
    if (isLeaf(v)) {
      const t = this.text(v);
      switch (v.tokenType) {
        case 'DQString':
        case 'SQString':
          return { type: 'Attribute', name, value: t.slice(1, -1), bound, templateLiteral: false, expression: false, span };
        case 'AttrName':
        case 'BareValue':
          return { type: 'Attribute', name, value: t, bound, templateLiteral: false, expression: false, span };
      }
    } else if (isNode(v) && v.rule === '$template') {
      const t = this.text(v);
      return { type: 'Attribute', name, value: t.slice(1, -1), bound, templateLiteral: true, expression: false, span };
    }
    // `={ … }` raw expression — value INCLUDES the braces (verbatim slice
    // from '{' through '}')
    const exprText = this.text({ offset: valueNode.offset, end: valueNode.end });
    return { type: 'Attribute', name, value: exprText, bound, templateLiteral: false, expression: true, span };
  }

  // ── Text ──
  adaptText(soup: CstNode): AstNode | null {
    const value = this.text(soup);
    if (!value) return null;
    // A whole-line `{@directive expr}` is an inline directive node.
    const m = value.match(/^\{@([a-zA-Z]+)\s+([\s\S]+)\}$/);
    if (m) {
      return { type: 'InlineDirective', directiveType: m[1], expression: m[2].trim(), span: this.spanOf(soup) };
    }
    return { type: 'Text', value, preserveTrailingWhitespace: false, span: this.spanOf(soup) };
  }

  adaptPipeText(pipe: CstNode): AstNode | null {
    const soup = pipe.children.find((k): k is CstNode => isNode(k) && k.rule === 'TextSoup');
    if (!soup) {
      return { type: 'Text', value: '', preserveTrailingWhitespace: false, span: this.spanOf(pipe) };
    }
    return this.adaptText(soup);
  }

  adaptStandaloneText(soup: CstNode): AstNode | null {
    const node = this.adaptText(soup);
    // Raw HTML passthrough (`<!DOCTYPE …>`, `<div>`) is legal as a bare line;
    // other bare text gets a diagnostic nudging toward `|` (still emitted).
    if (node?.type === 'Text' && !node.value.startsWith('<')) {
      this.errors.push(createError(
        ErrorCode.UnexpectedToken,
        `Bare text line — prefix with '|' for explicit text content`,
        node.span,
      ));
    }
    return node;
  }

  // ── @-blocks ──
  adaptAtBlock(block: CstNode): BlockNode {
    const kw = block.children.find((k): k is CstLeaf => isLeaf(k) && k.tokenType === 'AtKeyword')!;
    const blockType = this.text(kw).slice(1);

    const expr = block.children.find((k): k is CstNode => isNode(k) && k.rule === 'ExprBody');
    let expression = expr ? this.text(expr) : '';
    let attributes: AttributeNode[] | undefined;
    let boundary = expr ? expr.children.length : 0;
    if (expr) {
      const split = this.splitBlockAttrs(expr);
      if (split) {
        expression = split.expression;
        attributes = split.attributes;
        boundary = split.boundary;
      }
    }

    // Parse iteration structure for @each (either input form), pulling a
    // `:key` wrapper attribute into the structured key.
    let each: EachExpr | undefined;
    if (blockType === 'each' && expr) {
      each = this.parseEachExpr(expr, boundary) ?? undefined;
      const keyIdx = attributes?.findIndex(a => a.name === 'key' && a.bound) ?? -1;
      if (keyIdx >= 0 && attributes) {
        const keyAttr = attributes[keyIdx];
        attributes.splice(keyIdx, 1);
        if (attributes.length === 0) attributes = undefined;
        if (each) {
          if (each.key) {
            this.errors.push(createError(
              ErrorCode.UnexpectedToken,
              `@each has both a keyed-each '(…)' and a ':key' attribute — use one`,
              keyAttr.span,
            ));
          } else {
            each.key = keyAttr.expression
              ? keyAttr.value!.replace(/^\{|\}$/g, '').trim()
              : keyAttr.value ?? '';
          }
        }
      }
    }

    const lines = block.children.find((k): k is CstNode => isNode(k) && k.rule === 'Lines');
    const children = lines ? this.adaptLines(lines) : [];

    return {
      type: 'Block',
      blockType,
      expression,
      each,
      attributes,
      clauses: [{
        type: 'BlockClause', clauseType: null, expression, children, span: this.spanOf(block),
      }],
      span: this.spanOf(kw),
    };
  }

  // Parse an @each expression (tokens kids[0..boundary) of the ExprBody) in
  // EITHER form:
  //   JS/Vue style:  BINDINGS (of|in) COLLECTION         — split at the FIRST
  //     top-level of/in (a later `in` may be the JS operator in the collection)
  //   Svelte style:  COLLECTION as BINDINGS [(KEY)]      — split at the LAST
  //     top-level `as` (an earlier `as` may be a TS cast in the collection)
  // Bindings: comma-separated at top level, or one parenthesized group
  // `(value, key, i)`. Returns null when neither form matches (svelte mode
  // then passes the raw expression through; vue/astro report an error).
  private parseEachExpr(expr: CstNode, boundary: number): EachExpr | null {
    const kids = expr.children.slice(0, boundary);
    // drop a tolerated stray comma before the attr section
    while (kids.length && isLeaf(kids[kids.length - 1]) && this.text(kids[kids.length - 1]) === ',') kids.pop();
    if (kids.length === 0) return null;
    const isWord = (k: CstChild, w: string) =>
      isLeaf(k) && k.tokenType === 'AttrName' && this.text(k) === w;

    // Svelte style — LAST top-level `as`
    let asIdx = -1;
    for (let i = 0; i < kids.length; i++) if (isWord(kids[i], 'as')) asIdx = i;
    if (asIdx > 0) {
      const collection = this.sliceTokens(kids, 0, asIdx);
      let end = kids.length;
      let key: string | undefined;
      // trailing parenthesized key group: '(' … ')' at the very end
      const last = kids[kids.length - 1];
      if (isLeaf(last) && this.text(last) === ')') {
        // find its matching opener scanning back at top level
        for (let i = kids.length - 2; i > asIdx; i--) {
          const k = kids[i];
          if (isLeaf(k) && this.text(k) === '(') {
            key = this.sliceTokens(kids, i + 1, kids.length - 1);
            end = i;
            break;
          }
        }
      }
      const bindings = this.splitTopLevelCommas(kids, asIdx + 1, end);
      if (!collection || bindings.length === 0 || bindings.some(b => !b)) return null;
      return { collection, bindings, key };
    }

    // JS/Vue style — FIRST top-level `of`/`in`
    for (let i = 1; i < kids.length; i++) {
      if (!isWord(kids[i], 'of') && !isWord(kids[i], 'in')) continue;
      const collection = this.sliceTokens(kids, i + 1, kids.length);
      // LHS: a single parenthesized group `(a, b, c)` or comma-separated names
      let bindings: string[];
      const first = kids[0];
      if (isLeaf(first) && this.text(first) === '(' && i >= 2
          && isLeaf(kids[i - 1]) && this.text(kids[i - 1] as CstLeaf) === ')') {
        bindings = this.splitTopLevelCommas(kids, 1, i - 1);
      } else {
        bindings = this.splitTopLevelCommas(kids, 0, i);
      }
      if (!collection || bindings.length === 0 || bindings.some(b => !b)) return null;
      return { collection, bindings };
    }
    return null;
  }

  private sliceTokens(kids: CstChild[], from: number, to: number): string {
    if (from >= to) return '';
    return this.source.slice(kids[from].offset, kids[to - 1].end).trim();
  }

  private splitTopLevelCommas(kids: CstChild[], from: number, to: number): string[] {
    const parts: string[] = [];
    let start = from;
    for (let i = from; i < to; i++) {
      const k = kids[i];
      if (isLeaf(k) && this.text(k) === ',') {
        parts.push(this.sliceTokens(kids, start, i));
        start = i + 1;
      }
    }
    parts.push(this.sliceTokens(kids, start, to));
    return parts;
  }

  // `@each(item in items :key="item.id" v-memo="[item]")` — wrapper attributes
  // are whitespace-separated inside the same parens, like every other NMBL
  // attribute list. The attribute section starts at the first TOP-LEVEL
  // [AttrName, '=', quoted/template/brace value] triple. Top-level means a
  // direct child of the ExprBody (tokens inside nested parens/braces live in
  // nested ExprBody nodes), so `fn(a="b")` never splits. Requiring a QUOTED
  // (or `{…}`) value keeps host expressions safe: `a === b` / `x == y` fail
  // the not-another-`=`/`>` check, and `x = getFoo()` fails the value-shape
  // check. A stray comma before the section is tolerated and trimmed.
  private splitBlockAttrs(expr: CstNode): { expression: string; attributes: AttributeNode[]; boundary: number } | null {
    const kids = expr.children;
    for (let i = 0; i < kids.length; i++) {
      const name = kids[i];
      const eq = kids[i + 1];
      const val = kids[i + 2];
      if (!isLeaf(name) || name.tokenType !== 'AttrName') continue;
      if (!eq || !isLeaf(eq) || this.text(eq) !== '=') continue;
      if (!val) continue;
      // `==`, `===`, `=>` — not an attribute assignment
      if (isLeaf(val) && (this.text(val) === '=' || this.text(val) === '>')) continue;
      // value must be a quoted string, template literal, or `{…}` expression
      const isQuoted = isLeaf(val) && (val.tokenType === 'DQString' || val.tokenType === 'SQString');
      const isTemplate = isNode(val) && val.rule === '$template';
      const isBraceExpr = isLeaf(val) && this.text(val) === '{';
      if (!isQuoted && !isTemplate && !isBraceExpr) continue;
      // Parse the attr section: [AttrName, '=', value] groups, tolerating
      // stray commas between them.
      const attributes: AttributeNode[] = [];
      let j = i;
      while (j < kids.length) {
        const n = kids[j];
        if (isLeaf(n) && this.text(n) === ',') { j++; continue; }
        if (!isLeaf(n) || n.tokenType !== 'AttrName') break;
        let attrName = this.text(n);
        const bound = attrName.startsWith(':');
        if (bound) attrName = attrName.slice(1);
        const eqTok = kids[j + 1];
        if (!eqTok || !isLeaf(eqTok) || this.text(eqTok) !== '=') break;
        const valTok = kids[j + 2];
        if (!valTok) break;
        let value: string;
        let expression = false;
        let templateLiteral = false;
        const valText = this.text(valTok);
        if (isLeaf(valTok) && (valTok.tokenType === 'DQString' || valTok.tokenType === 'SQString')) {
          value = valText.slice(1, -1);
        } else if (isNode(valTok) && valTok.rule === '$template') {
          value = valText.slice(1, -1);
          templateLiteral = true;
        } else if (isLeaf(valTok) && this.text(valTok) === '{') {
          // `={ … }` raw expression — consume through the matching '}'
          let end = j + 3;
          while (end < kids.length && !(isLeaf(kids[end]) && this.text(kids[end]) === '}')) end++;
          const close = kids[end];
          value = this.source.slice(valTok.offset, close ? close.end : valTok.end);
          expression = true;
          attributes.push({
            type: 'Attribute', name: attrName, value, bound,
            templateLiteral: false, expression: true,
            span: this.span(n.offset, close ? close.end : valTok.end),
          });
          j = end + 1;
          continue;
        } else {
          value = valText;
        }
        attributes.push({
          type: 'Attribute', name: attrName, value, bound, templateLiteral, expression,
          span: this.span(n.offset, valTok.end),
        });
        j += 3;
      }
      if (attributes.length === 0) return null;
      return {
        // trim trailing whitespace and a tolerated stray comma
        expression: this.source.slice(expr.offset, name.offset).replace(/[\s,]+$/, ''),
        attributes,
        boundary: i,
      };
    }
    return null;
  }
}

// `:md\n  body…` → { mode: 'md', body: dedented body }
function splitRawContent(text: string): { mode: string; body: string } {
  const nl = text.indexOf('\n');
  const header = nl < 0 ? text : text.slice(0, nl);
  const mode = header.replace(/^:/, '').trim();
  const rest = nl < 0 ? '' : text.slice(nl + 1);
  return { mode, body: dedentBlock(rest) };
}

function dedentBlock(text: string): string {
  const lines = text.replace(/\s+$/, '').split('\n');
  let min = Infinity;
  for (const l of lines) {
    if (!l.trim()) continue;
    const indent = l.match(/^[ \t]*/)![0].length;
    if (indent < min) min = indent;
  }
  if (!isFinite(min) || min === 0) return lines.join('\n');
  return lines.map(l => l.slice(min)).join('\n');
}
