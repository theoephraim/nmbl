// nmbl-grammar.ts — the NMBL language defined ONCE as a monogram grammar.
// The parser, TextMate grammar, tree-sitter grammar, Monarch tokenizer, and
// VS Code language-configuration are all derived from this single definition.
//
// NMBL is indentation-sensitive (like YAML) with flow suspension inside
// attribute parens (like YAML's `[`/`{`): newlines are structural at block
// level and insignificant inside `( … )`, which is what makes multiline
// attribute lists work with zero special cases.
//
// Lexing strategy:
// - Block context vs flow context is the load-bearing split. Selector
//   shorthand (`#id`, `.class`), `@if`-keywords, tag names and text chunks
//   are `blockOnly` tokens; inside parens the same leading chars belong to
//   attribute names (`@click.stop`, `#slotName`, `:bound`), matched by the
//   AttrName token that only ever wins in flow (every block position is
//   claimed by an earlier blockOnly token).
// - NO token declares `blockPattern`: that flag opts into YAML's
//   plain-scalar continuation folding (rest-of-line capture), which is wrong
//   for NMBL.
// - Inline text is "token soup": the parser matches a run of tokens and the
//   compiler reconstructs verbatim text by slicing the source between the
//   first token's `offset` and the last token's `end` (the CST is lossless).
import {
  token, rule, defineGrammar, alt, many, many1, opt,
  altPattern, seq, oneOf, noneOf, range, star, plus, never, anyChar,
  notFollowedBy, adjacent, tsPrecDynamic,
} from 'monogram/src/api.ts';
import type { IndentConfig } from 'monogram/src/types.ts';

// ── Structural tokens emitted by the lexer's indentation state machine ──
const Indent = token(never(), {});
const Dedent = token(never(), {});
const Newline = token(never(), {});

// ── Character classes ──
const alpha = oneOf(range('a', 'z'), range('A', 'Z'));
const digit = range('0', '9');
const nameChar = oneOf(alpha, digit, '-', '_');
const whitespace = oneOf(' ', '\t', '\n', '\r');

// ── Block-context tokens (structure) ──
const IdSel = token(seq('#', plus(nameChar)), {
  blockOnly: true,
  scope: 'entity.other.attribute-name.id',
});
const ClassSel = token(seq('.', plus(nameChar)), {
  blockOnly: true,
  scope: 'entity.other.attribute-name.class',
});
// `@if` / `@each` / `@else` … — block context only; in flow, `@click`-style
// attribute names are matched by AttrName instead.
const AtKeyword = token(seq('@', plus(alpha)), {
  blockOnly: true,
  scope: 'keyword.control',
});
// A PascalCase component name at a structural position — declared before
// TagName so it wins for uppercase-led names; a distinct token gives
// components their own highlight scope.
const ComponentName = token(seq(range('A', 'Z'), star(nameChar)), {
  blockOnly: true,
  identifier: true,
  tsPrec: 1,
  scope: 'support.class.component',
});
// A tag name at a structural position (lowercase-led).
const TagName = token(seq(range('a', 'z'), star(nameChar)), {
  blockOnly: true,
  identifier: true,
  tsPrec: 1,
  scope: 'entity.name.tag',
});
// Raw content block (`script:`, `article:md`, bare `:md`) — EMITTED by the
// patched lexer's rawBlock mode (placeholder pattern, skipped in the regex
// loop): the `:mode` introducer plus all following more-indented lines as one
// verbatim token. The compiler splits the mode word from the body.
const RawContent = token(never(), { scope: 'source.embedded' });

// ── Comments ──
// Rendered comment: `//! …` becomes an HTML comment in output — a REAL token
// (a structural node), unlike silent comments. Must be declared before
// SilentComment (`//` is its prefix). Line-start `//!` lines reach the token
// loop via the patched indent.commentExcept carve-out.
const RenderedComment = token(seq('//!', star(noneOf('\n'))), {
  scope: 'comment.line.double-slash.rendered',
});
// Silent comment: stripped from output entirely. Comment-ONLY lines are
// swallowed by indent.comment before tokens are tried; this token covers
// trailing comments (after attrs/text) and comments inside attribute lists.
const SilentComment = token(seq('//', star(noneOf('\n'))), {
  skip: true,
  scope: 'comment.line.double-slash',
});
// Rendered block comment `/*! … */` (may span lines).
const RenderedBlockComment = token(
  seq('/*!', star(seq(notFollowedBy('*/'), anyChar()), { greedy: false }), '*/'),
  { scope: 'comment.block.rendered' },
);
// Silent block comment `/* … */` — invisible to the parser (skip), usable to
// toggle individual attributes inside an attribute list.
const BlockComment = token(
  seq('/*', star(seq(notFollowedBy('*/'), anyChar()), { greedy: false }), '*/'),
  { skip: true, scope: 'comment.block' },
);
// A run of inline-text characters. Excludes whitespace (token separators),
// parens (flow punctuation), `>` (block expansion) and `|` (pipe text) —
// those lex as punctuation and are re-admitted into text by the TextSoup
// rule; the compiler slices the original source, so nothing is lost.
const TextChunk = token(plus(noneOf(whitespace, '(', ')', '>', '|')), {
  blockOnly: true,
  scope: 'text',
});

// ── Flow-context tokens (attributes & expressions) ──
// An attribute name: may start with `@` / `:` / `#` (Vue event/bind/slot
// shorthand) and contain `.` (modifiers) and `:` (namespaced names like
// `client:load`). Only ever wins inside parens — every block-context
// position is claimed by an earlier blockOnly token.
const AttrName = token(
  seq(oneOf(alpha, '@', ':', '#'), star(oneOf(nameChar, '.', ':', '@'))),
  { identifier: true, scope: 'entity.other.attribute-name' },
);
// NOTE: deliberately NOT flagged `string: true` — that flag opts into YAML's
// flow `"key":value` separator carve-out, which would split NMBL's `:bound`
// attribute shorthand whenever it follows a quoted value.
const DQString = token(
  seq('"', star(altPattern(seq('\\', oneOf('"', '\\')), noneOf('"', '\\'))), '"'),
  { scope: 'string.quoted.double', escape: seq('\\', anyChar()) },
);
const SQString = token(
  seq("'", star(altPattern(seq('\\', oneOf("'", '\\')), noneOf("'", '\\'))), "'"),
  { scope: 'string.quoted.single', escape: seq('\\', anyChar()) },
);
// Template literal — `…${expr}…` (engine-scanned; interpolations re-enter the
// lexer). The highlight-only `interpolation` regions give `${…}` holes their
// own scopes in the derived grammars.
const Template = token(
  seq('`', star(altPattern(noneOf('`', '\\', '$'), seq('\\', oneOf('`', '\\', '$')), seq('$', notFollowedBy('{')))), '`'),
  {
    template: { open: '`', interpOpen: '${', interpClose: '}' },
    scope: 'string.template',
  },
);
// Bare attribute values (`colspan=2`, `href=/a/b`) and expression chunks.
// Excludes `>` and `|` so block expansion and pipe text lex as punctuation
// in block context (BareValue is not blockOnly and would otherwise win), and
// `,` so the @-block wrapper-attribute separator lexes as punctuation
// (`@each(item in items, :key="item.id")`).
const BareValue = token(
  plus(noneOf(whitespace, '(', ')', '{', '}', '"', "'", '`', '=', '>', '|', ',')),
  { scope: 'string.unquoted' },
);

// ── Rules ──

// Balanced expression soup inside `={ … }` raw-expression values and
// `@if( … )` directive arguments. Reconstructed verbatim by the compiler.
// NON-NULLABLE (many1): a rule whose only match is empty returns null in
// monogram's parser (forward-progress requirement) — call sites wrap in opt().
const ExprBody = rule(() => [
  [many1(alt(AttrName, DQString, SQString, Template, BareValue, '=', '>', '|', ',',
    ['(', opt(ExprBody), ')'],
    ['{', opt(ExprBody), '}'],
  ))],
]);

// One attribute: name, optionally `= value`. `:bound` shorthand is a Name.
const AttrValue = rule(() => [
  DQString, SQString, Template,
  ['{', opt(ExprBody), '}'],
  AttrName, BareValue,
]);
const Attr = rule(() => [
  [AttrName, opt('=', AttrValue)],
]);
const AttrList = rule(() => [
  ['(', many(Attr), ')'],
]);

// Inline text: a run of tokens to end of line, sliced verbatim. In block
// context most chars fall into TextChunk; selector/keyword/tag tokens and
// the structural punctuation are re-admitted here so any char sequence is
// representable as text. Parens in text open a flow region (newlines stay
// suspended inside), so the flow-context tokens are admitted as well —
// `p hello (world)` and `{@render header()}` are plain text.
const TextSoup = rule(() => [
  [many1(alt(TextChunk, TagName, ComponentName, IdSel, ClassSel, AtKeyword,
    AttrName, DQString, SQString, Template, BareValue,
    '=', '>', '|', '(', ')', ','))],
]);

// The head of a tag line: `tag`, `Component`, `tag#id.class`, or selector-led
// implicit div.
const TagHead = rule(() => [
  [alt(TagName, ComponentName), many(adjacent, alt(IdSel, ClassSel))],
  [alt(IdSel, ClassSel), many(adjacent, alt(IdSel, ClassSel))],
]);

// A full element line: head, optional attrs, then ONE of:
//   - a raw content block (`script:` / `article:md` — RawContent swallows the
//     introducer and the indented body),
//   - block expansion (`li > a(href="/") Home`),
//   - inline text, then an optional indented block of children.
const Element = rule(() => [
  [TagHead, opt(adjacent, AttrList), RawContent],
  [TagHead, opt(adjacent, AttrList), opt(alt(['>', Element], TextSoup)), opt(Indent, Lines, Dedent)],
]);

// Pipe text line: `| raw text`
const PipeText = rule(() => [
  ['|', opt(TextSoup)],
]);

// An @-block line: `@if(expr)` / `@else` / `@each(items as item)` with an
// optional indented body. Clause chaining (@if/@else) is the COMPILER's
// concern — structurally each @-line owns its own body.
const AtBlock = rule(() => [
  [AtKeyword, opt('(', opt(ExprBody), ')'), opt(Indent, Lines, Dedent)],
]);

// Any single line-level node. TextLine (last) catches raw-HTML passthrough
// lines (`<!DOCTYPE html>`, `<div>`) and stray text — the compiler validates
// which of those are legal. RawContent alone is a bare `:md` content block on
// an implicit element. RenderedComment lines are structural nodes.
const Line = rule(() => [
  AtBlock,
  PipeText,
  [RenderedComment],
  [RenderedBlockComment],
  [RawContent],
  Element,
  // `TextSoup` is the catch-all last alternative (the interpreted parser only reaches it when nothing
  // earlier matched). For tree-sitter's GLR — which explores all alternatives at once — give it a
  // negative dynamic precedence so a real element/pipe/comment line outranks parsing the same line as
  // a bare run of text. Transparent to every other generator.
  [tsPrecDynamic(-1, TextSoup)],
]);

// Sibling lines at one indentation level.
const Lines = rule(() => [
  [Line, many(Newline, Line)],
]);

// A document: sibling lines at the root level.
const Document = rule(() => [
  [opt(Lines)],
]);

const indent: IndentConfig = {
  indentToken: 'Indent',
  dedentToken: 'Dedent',
  newlineToken: 'Newline',
  // `(` suspends indentation → multiline attribute lists. Braces are NOT
  // flow puncts: `{` appears in text interpolation and must stay textual.
  flowOpen: ['('],
  flowClose: [')'],
  // Silent comments: comment-only `// …` lines are invisible to indentation —
  // EXCEPT `//!` rendered comments (commentExcept carve-out, engine patch),
  // which lex as ordinary tokens and become structural nodes.
  comment: '//',
  commentExcept: '!',
  // NMBL has `:attr` shorthand after values/parens. monogram's flow `:`
  // key-separator carve-out is now opt-in (`flowSeparatorAfterTokens`), so
  // simply NOT declaring it leaves `:attr` intact after values / `)`.
  // Raw content blocks (`script:`, `article:md`, bare `:md`) — engine patch:
  // a line-trailing `:mode` introducer captures the indented body verbatim.
  rawBlock: { token: 'RawContent' },
};

/**
 * Opaque handle for the NMBL grammar object. Internally this is monogram's
 * CstGrammar; typed opaquely so monogram's (unpublished, .ts-only) types
 * never leak into @nmbl-lang/core's public d.ts.
 */
export type NmblGrammar = { readonly name: string } & Record<string, unknown>;

const grammar = defineGrammar({
  name: 'nmbl',
  scopeName: 'source.nmbl',
  // Declaration order = lexer precedence (earlier wins at a position).
  // blockOnly structural tokens first, then flow tokens.
  tokens: {
    Indent, Dedent, Newline,
    RawContent,
    IdSel, ClassSel, AtKeyword, ComponentName, TagName,
    RenderedBlockComment, RenderedComment, SilentComment, BlockComment,
    TextChunk,
    AttrName, DQString, SQString, Template, BareValue,
  },
  rules: {
    ExprBody, AttrValue, Attr, AttrList, TextSoup, TagHead,
    Element, PipeText, AtBlock, Line, Lines,
    // entry rule must be declared last (parser entry = last rule)
    Document,
  },
  entry: Document,
  indent,
  // tree-sitter GLR conflicts: NMBL's grammar is ordered-choice (the interpreted parser tries Line
  // alternatives in order); tree-sitter's GLR explores them simultaneously, so the catch-all TextSoup
  // line genuinely conflicts with the structured line types. Declared so tree-sitter generates (the
  // `tsPrecDynamic` above then steers which interpretation wins). Inert for every other generator.
  // tree-sitter: a structural token (tag/selector/attr name) inside an inline-text run is plain
  // text, not its structural role (`p hello` — `hello` is text). Inert for every other generator.
  tsTextRules: ['TextSoup'],
  conflicts: [
    ['TextSoup', 'PipeText'],
    ['TextSoup', 'TagHead'],
    ['TextSoup', 'AtBlock'],
    ['TextSoup', 'Element'],
    ['Element'],
  ],
});

export default grammar as unknown as NmblGrammar;
