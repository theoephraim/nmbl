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
  const markdownBlock = {
    comment: 'NMBL :md content block — body embeds Markdown (any tag:md or bare :md)',
    begin: '^(\\s*)([^\\s]*)((:)md)\\s*$',
    beginCaptures: {
      '2': tagHeadCapture,
      '3': { name: 'storage.type.content-mode.nmbl' },
    } as Record<string, unknown>,
    while: whileMoreIndented,
    contentName: 'meta.embedded.block.markdown text.html.markdown',
    patterns: [{ include: 'text.html.markdown' }],
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

  // Add to repository (keyed so they can be referenced or inspected).
  g.repository['nmbl-script-block'] = scriptBlock;
  g.repository['nmbl-style-block'] = styleBlock;
  g.repository['nmbl-markdown-block'] = markdownBlock;
  g.repository['nmbl-generic-raw-block'] = genericRawBlock;

  // Prepend include references so they fire BEFORE all other patterns.
  // Order matters: most-specific rules first (script, style, md), then the
  // generic catch-all last (it matches any tag:mode that didn't already fire).
  g.patterns.unshift(
    { include: '#nmbl-script-block' },
    { include: '#nmbl-style-block' },
    { include: '#nmbl-markdown-block' },
    { include: '#nmbl-generic-raw-block' },
  );
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
