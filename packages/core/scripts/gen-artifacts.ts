// gen-artifacts.ts — derive every editor artifact from the single NMBL
// grammar definition (src/nmbl-grammar.ts). Run with: bun scripts/gen-artifacts.ts
//
//   - TextMate grammar + VS Code language-configuration → packages/vscode-extension
//   - tree-sitter grammar + highlight queries           → generated/tree-sitter/nmbl
//   - Monarch (Monaco) tokenizer                        → generated/
//   - CST node types + matchers (TypeScript)            → generated/
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTmLanguage } from 'monogram/src/gen-tm.ts';
import { generateLanguageConfig } from 'monogram/src/gen-vscode-config.ts';
import { generateTreeSitter } from 'monogram/src/gen-treesitter.ts';
import { generateMonarch } from 'monogram/src/gen-monarch.ts';
import { generateAstTypes } from 'monogram/src/gen-ast-types.ts';
import { generateCstMatch } from 'monogram/src/gen-cst-match.ts';
import type { CstGrammar } from 'monogram/src/types.ts';
import grammarOpaque from '../src/nmbl-grammar.ts';

const grammar = grammarOpaque as unknown as CstGrammar & { name: string; scopeName?: string };
const here = dirname(fileURLToPath(import.meta.url));
const parserRoot = resolve(here, '..');
const vscodeExt = resolve(parserRoot, '../vscode-extension');

function emit(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content.endsWith('\n') ? content : content + '\n');
  console.log(`→ ${path}`);
}

const json = (v: unknown) => JSON.stringify(v, null, 2);

// ─────────────────────────────────────────────────────────────────────────────
// NMBL-SPECIFIC POST-PROCESSING — inject indent-bounded content-block regions
// into the TextMate grammar BEFORE it is written to disk. These rules are NOT
// part of monogram core (which has no concept of "raw block" embedding); they
// are added here because the NMBL lexer has a rawBlock extension that makes all
// more-indented lines after a `:mode` introducer raw content.
//
// TextMate uses begin/while patterns for indent-bounded regions:
//   • begin  — matches the INTRODUCER line; group 1 MUST capture leading
//               whitespace so the while can backreference it as \1.
//   • while  — ^(?=\1[ \t]|[ \t]*$)  continues on lines that start with the
//               same indent + at least one extra space/tab, or are blank.
//
// Gluing constraint (mirrors the lexer): the `:` must be IMMEDIATELY preceded
// by a non-space character (no top-level whitespace between tag and `:`), OR
// the `:` is at the line lead (only leading whitespace before it).
// We approximate this in the regex by using [^\s]* — which cannot cross a
// space — so "label Size:" is correctly rejected (space before `:` breaks the
// [^\s]* scan), while "article:md" and ":md" are accepted.
//
// Rules are injected AT THE FRONT of grammar.patterns (highest priority) and
// also added to grammar.repository for diagnostics.
// ─────────────────────────────────────────────────────────────────────────────

function injectNmblContentBlocks(
  tmGrammar: ReturnType<typeof generateTmLanguage>,
): void {
  // Shared while condition: continue on lines more-indented than the begin
  // line (leading whitespace captured as \1) or blank lines.
  const whileMoreIndented = '^(?=\\1[ \\t]|[ \\t]*$)';

  // ── Helper: beginCaptures that rescope the tag-head through main grammar ──
  // Group 2 in the begin patterns captures the tag head (everything before
  // the introducer colon). We re-tokenize it via the repository rules so the
  // tag name keeps its normal highlighting scope.
  const tagHeadCapture = {
    patterns: [
      { include: '#componentname' },
      { include: '#tagname' },
      { include: '#attrname' },
      { include: '#punctuation' },
    ],
  };

  // ── Rule 1: script: — body is embedded JavaScript ────────────────────────
  // Matches lines like `script:` or `script(type="module"):` (tag "script"
  // with an optional simple attribute list, then bare `:` with no mode name).
  // The (?:\([^)]*\))* part handles zero or more balanced-paren attr groups.
  const scriptBlock = {
    comment: 'NMBL script: content block — body embeds JavaScript',
    begin: '^(\\s*)(script(?:\\([^)]*\\))*)((:))\\s*$',
    beginCaptures: {
      '2': tagHeadCapture,
      '3': { name: 'storage.type.content-mode.nmbl' },
    } as Record<string, unknown>,
    while: whileMoreIndented,
    contentName: 'meta.embedded.block.javascript source.js',
    patterns: [{ include: 'source.js' }],
  };

  // ── Rule 2: style: — body is embedded CSS ─────────────────────────────────
  const styleBlock = {
    comment: 'NMBL style: content block — body embeds CSS',
    begin: '^(\\s*)(style(?:\\([^)]*\\))*)((:))\\s*$',
    beginCaptures: {
      '2': tagHeadCapture,
      '3': { name: 'storage.type.content-mode.nmbl' },
    } as Record<string, unknown>,
    while: whileMoreIndented,
    contentName: 'meta.embedded.block.css source.css',
    patterns: [{ include: 'source.css' }],
  };

  // ── Rule 3: :md mode (any tag:md or bare :md) — body is Markdown ──────────
  // begin: ^(\s*)([^\s]*)((:)md)\s*$
  //   • [^\s]* matches zero-or-more non-space chars (the optional tag head);
  //     it cannot cross a space, so "label Size:md" is rejected.
  //   • With zero chars it matches bare ":md" at line start.
  //   • With "article" it matches "article:md".
  // Group 2 captures the tag head for rescoping; group 3 captures ":md".
  // Whitespace-tolerant Markdown patterns, applied inline instead of embedding
  // the full `text.html.markdown` grammar. NMBL indents `:md` bodies, and the
  // full grammar treats any line indented >=4 spaces as a raw code block — so a
  // structurally-indented `:md` body renders flat (headings/lists/emphasis lost).
  // These patterns ignore leading indentation and carry no raw-block rule.
  //
  // This is intentionally fuller than the website's minimal `:md` grammar
  // (packages/website/src/grammars/markdown-embedded.json) — the website only
  // shows short snippets, but the editor is for real authoring. Block rules come
  // first (fenced code first, so its body isn't re-parsed), then inline rules.
  const markdownPatterns = [
    // Fenced code block — raw body, not re-tokenised. The end repeats the same
    // fence run (\1); group 2 scopes the info string / language.
    {
      begin: '^\\s*(`{3,}|~{3,})[ \\t]*(\\S+)?.*$',
      end: '^\\s*\\1[ \\t]*$',
      name: 'markup.fenced_code.block.markdown',
      beginCaptures: {
        '2': { name: 'fenced_code.block.language.markdown' },
      } as Record<string, unknown>,
    },
    // ATX heading (`#`..`######` + space).
    { match: '^\\s*#{1,6}\\s.*$', name: 'markup.heading.markdown' },
    // Horizontal rule (`---`, `***`, `___`, optionally spaced).
    { match: '^\\s*([-*_])(?:[ \\t]*\\1){2,}[ \\t]*$', name: 'meta.separator.markdown' },
    // Blockquote.
    { match: '^\\s*>\\s?', name: 'markup.quote.markdown' },
    // List marker (unordered or ordered).
    { match: '^\\s*([-*+]|\\d+[.)])\\s', name: 'punctuation.definition.list.begin.markdown' },
    // Pipe-table row.
    { match: '^\\s*\\|.*\\|[ \\t]*$', name: 'markup.table.markdown' },
    // Inline code span.
    { begin: '`', end: '`', name: 'markup.inline.raw.string.markdown' },
    // Links and images: `[text](url)` / `![alt](url)`.
    {
      match: '(!?\\[)([^\\]]*)(\\])(\\()([^)]+)(\\))',
      captures: {
        '2': { name: 'string.other.link.title.markdown' },
        '5': { name: 'markup.underline.link.markdown' },
      },
    },
    // Emphasis: bold-italic, then bold, then italic (most-specific first), strike.
    { match: '(\\*\\*\\*|___)(?=\\S)(.+?)(?<=\\S)\\1', name: 'markup.bold.italic.markdown' },
    { match: '(\\*\\*|__)(?=\\S)(.+?)(?<=\\S)\\1', name: 'markup.bold.markdown' },
    { match: '(\\*|_)(?=\\S)([^*_]+?)(?<=\\S)\\1', name: 'markup.italic.markdown' },
    { match: '(~~)(?=\\S)(.+?)(?<=\\S)(~~)', name: 'markup.strikethrough.markdown' },
  ];
  const markdownBlock = {
    comment: 'NMBL :md content block — body embeds Markdown (any tag:md or bare :md)',
    begin: '^(\\s*)([^\\s]*)((:)md)\\s*$',
    beginCaptures: {
      '2': tagHeadCapture,
      '3': { name: 'storage.type.content-mode.nmbl' },
    } as Record<string, unknown>,
    while: whileMoreIndented,
    contentName: 'meta.embedded.block.markdown text.html.markdown',
    patterns: markdownPatterns,
  };

  // ── Rule 4: generic raw content block (any other tag: or tag:mode) ────────
  // Catches all remaining raw-block introducers not handled by rules 1-3.
  // Must come AFTER the specific rules so they win for script/style/:md.
  // begin: ^(\s*)([^\s]*)((:)([A-Za-z][A-Za-z0-9-]*)?)\s*$
  //   • Same [^\s]* no-space constraint as rule 3.
  //   • Mode name ([A-Za-z]...) is optional — matches bare "tag:" too.
  const genericRawBlock = {
    comment: 'NMBL generic raw content block (tag: or tag:mode not handled above)',
    begin: '^(\\s*)([^\\s]*)((:)([A-Za-z][A-Za-z0-9-]*)?)\\s*$',
    beginCaptures: {
      '2': tagHeadCapture,
      '3': { name: 'storage.type.content-mode.nmbl' },
    } as Record<string, unknown>,
    while: whileMoreIndented,
    name: 'string.unquoted.content-block.nmbl',
  };

  // ── Inject into the grammar object ────────────────────────────────────────
  const g = tmGrammar as unknown as {
    patterns: unknown[];
    repository: Record<string, unknown>;
  };

  // YAML frontmatter delimited by `---` at the very top of a .nmbl file.
  const frontmatterBlock = {
    comment: 'YAML frontmatter delimited by --- at the very top of a .nmbl file',
    begin: '\\A(---)[ \\t]*$',
    beginCaptures: {
      '1': { name: 'punctuation.definition.frontmatter.begin.nmbl' },
    } as Record<string, unknown>,
    end: '^(---)[ \\t]*$',
    endCaptures: {
      '1': { name: 'punctuation.definition.frontmatter.end.nmbl' },
    } as Record<string, unknown>,
    contentName: 'meta.embedded.block.frontmatter.yaml source.yaml',
    patterns: [{ include: 'source.yaml' }],
  };

  // Add to repository (keyed so they can be referenced or inspected).
  g.repository['nmbl-frontmatter'] = frontmatterBlock;
  g.repository['nmbl-script-block'] = scriptBlock;
  g.repository['nmbl-style-block'] = styleBlock;
  g.repository['nmbl-markdown-block'] = markdownBlock;
  g.repository['nmbl-generic-raw-block'] = genericRawBlock;

  // Prepend include references so they fire BEFORE all other patterns.
  // Frontmatter first (it's anchored to file start), then most-specific content
  // rules (script, style, md), then the generic catch-all last.
  g.patterns.unshift(
    { include: '#nmbl-frontmatter' },
    { include: '#nmbl-script-block' },
    { include: '#nmbl-style-block' },
    { include: '#nmbl-markdown-block' },
    { include: '#nmbl-generic-raw-block' },
  );

  // Allow comments inside attribute-list parens, e.g. `div(\n  // note\n  foo)`.
  // monogram's generated `attrlist` rule doesn't include the comment rules, so
  // prepend them here (previously a hand-edit to the generated JSON that regen
  // would clobber — now durable in the generator).
  const attrlist = g.repository['attrlist'] as { patterns?: unknown[] } | undefined;
  if (attrlist?.patterns) {
    attrlist.patterns.unshift(
      { include: '#renderedblockcomment' },
      { include: '#renderedcomment' },
      { include: '#silentcomment' },
      { include: '#blockcomment' },
    );
  }
}

// TextMate grammar + language configuration → the VS Code extension package
const tmGrammar = generateTmLanguage(grammar, 'nmbl');
injectNmblContentBlocks(tmGrammar);
emit(join(vscodeExt, 'syntaxes/nmbl.tmLanguage.json'), json(tmGrammar));
emit(join(vscodeExt, 'language-configuration.json'), json(generateLanguageConfig(grammar)));

// tree-sitter
const ts = generateTreeSitter(grammar, 'nmbl');
emit(join(parserRoot, 'generated/tree-sitter/nmbl/grammar.js'), ts.grammarJs);
emit(join(parserRoot, 'generated/tree-sitter/nmbl/queries/highlights.scm'), ts.highlightsScm);
if (ts.scannerC.trim()) emit(join(parserRoot, 'generated/tree-sitter/nmbl/src/scanner.c'), ts.scannerC);
emit(join(parserRoot, 'generated/tree-sitter/nmbl/package.json'),
  json({ name: 'tree-sitter-nmbl', version: '0.0.0', private: true }));

// Monarch (Monaco) tokenizer
emit(join(parserRoot, 'generated/nmbl.monarch.json'), json(generateMonarch(grammar)));

// CST types + matchers
emit(join(parserRoot, 'generated/nmbl.cst-types.ts'), generateAstTypes(grammar));
emit(join(parserRoot, 'generated/nmbl.cst-match.ts'), generateCstMatch(grammar, './nmbl.cst-types.ts'));

console.log('\nDone.');
