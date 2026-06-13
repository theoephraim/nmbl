// verify-grammar.mjs — loads the generated nmbl.tmLanguage.json via
// vscode-textmate + vscode-oniguruma and tokenizes highlighting-example.nmbl,
// asserting every line produces at least one token.
//
// Extended assertions (NMBL content-block embed checks):
//   • Lines inside a script: block must have 'source.js' in their scope chain.
//   • Lines inside a style: block must have 'source.css' in their scope chain.
//   • Lines inside an :md block must have 'text.html.markdown' in their scope chain.
//   • After dedent (back to base indentation), scope returns to normal source.nmbl.
//   • "label Size:" followed by an indented line must NOT produce a content-block region.
//
// Usage: node scripts/verify-grammar.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');

// Use createRequire so we can resolve CJS packages from this ESM script.
const req = createRequire(import.meta.url);

const { createOnigScanner, createOnigString, loadWASM } = req('vscode-oniguruma');
const { Registry, INITIAL } = req('vscode-textmate');

// Load the Oniguruma WASM binary from its published release location.
const wasmPath = resolve(
  pkgRoot,
  'node_modules/vscode-oniguruma/release/onig.wasm',
);
const wasmBin = readFileSync(wasmPath);
await loadWASM({ data: wasmBin });

// Load the generated TextMate grammar.
const grammarPath = resolve(pkgRoot, 'syntaxes/nmbl.tmLanguage.json');
const grammarJson = JSON.parse(readFileSync(grammarPath, 'utf8'));

// Minimal stub grammars for embedded language scopes.
// These stubs have NO patterns — they only signal to vscode-textmate that the
// scope name is a valid, registered grammar so that contentName embeds resolve
// correctly.  Without them, vscode-textmate silently falls back and the content-
// block region may not apply its contentName scope to body lines.
const stubGrammars = {
  'source.js': { scopeName: 'source.js', patterns: [], repository: {} },
  'source.css': { scopeName: 'source.css', patterns: [], repository: {} },
  'source.yaml': { scopeName: 'source.yaml', patterns: [], repository: {} },
  'text.html.markdown': { scopeName: 'text.html.markdown', patterns: [], repository: {} },
};

const registry = new Registry({
  onigLib: Promise.resolve({ createOnigScanner, createOnigString }),
  loadGrammar: async (scopeName) => {
    if (scopeName === 'source.nmbl') return grammarJson;
    return stubGrammars[scopeName] ?? null;
  },
});

const grammar = await registry.loadGrammar('source.nmbl');
if (!grammar) {
  console.error('ERROR: failed to load grammar for scope source.nmbl');
  process.exit(1);
}

// ── Basic tokenization of the example file ──────────────────────────────────
const examplePath = resolve(pkgRoot, 'highlighting-example.nmbl');
const source = readFileSync(examplePath, 'utf8');
const lines = source.split('\n');

let failed = false;
let ruleStack = INITIAL;

console.log(`Tokenizing ${examplePath}`);
console.log('─'.repeat(72));

// lineResults[i] = { tokens, ruleStack } for assertions below
const lineResults = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const result = grammar.tokenizeLine(line, ruleStack);
  ruleStack = result.ruleStack;

  lineResults.push({ line, tokens: result.tokens });

  const tokens = result.tokens;

  // A blank line is expected to have zero meaningful tokens — skip the zero
  // check only for truly empty/whitespace-only lines.
  const isBlank = line.trim() === '';

  if (!isBlank && tokens.length === 0) {
    console.error(`FAIL  line ${i + 1}: zero tokens for non-blank line: ${JSON.stringify(line)}`);
    failed = true;
    continue;
  }

  // Print per-line summary.
  const scopes = tokens
    .map((t) => {
      const text = line.slice(t.startIndex, t.endIndex);
      const scope = t.scopes[t.scopes.length - 1]; // innermost scope
      return `${JSON.stringify(text)}:${scope}`;
    })
    .join('  ');

  const lineNum = String(i + 1).padStart(3, ' ');
  const status = isBlank ? 'BLANK' : 'OK   ';
  console.log(`${status} ${lineNum}: ${scopes}`);
}

console.log('─'.repeat(72));

// ── Content-block embed assertions ──────────────────────────────────────────
console.log('\nRunning content-block embed assertions…\n');

/**
 * Returns the full scope chain (all scopes) for the first token on a line, or
 * an empty array if the line has no tokens.
 */
function scopesAt(lineIdx) {
  const { tokens, line } = lineResults[lineIdx];
  if (!tokens.length) return [];
  return tokens[0].scopes;
}

/**
 * Returns true if ANY token on the given line has the given scope in its chain.
 */
function lineHasScope(lineIdx, scope) {
  const { tokens, line } = lineResults[lineIdx];
  return tokens.some((t) => t.scopes.includes(scope));
}

function assertScopePresent(lineIdx, scope, description) {
  if (!lineHasScope(lineIdx, scope)) {
    console.error(
      `FAIL  embed assert — line ${lineIdx + 1} (${JSON.stringify(lines[lineIdx])})` +
      ` should have scope '${scope}' [${description}]` +
      `\n      actual scopes: ${JSON.stringify(scopesAt(lineIdx))}`,
    );
    failed = true;
  } else {
    console.log(`PASS  line ${lineIdx + 1}: has '${scope}'  [${description}]`);
  }
}

function assertScopeAbsent(lineIdx, scope, description) {
  if (lineHasScope(lineIdx, scope)) {
    console.error(
      `FAIL  embed assert — line ${lineIdx + 1} (${JSON.stringify(lines[lineIdx])})` +
      ` should NOT have scope '${scope}' [${description}]` +
      `\n      actual scopes: ${JSON.stringify(scopesAt(lineIdx))}`,
    );
    failed = true;
  } else {
    console.log(`PASS  line ${lineIdx + 1}: absent '${scope}'  [${description}]`);
  }
}

// Find significant lines by content so the assertions stay valid even if the
// example file gains extra lines above or between the sections.
function findLine(pattern) {
  const idx = lines.findIndex((l) => pattern.test(l));
  if (idx < 0) throw new Error(`Could not find line matching ${pattern}`);
  return idx;
}

// ── frontmatter block ────────────────────────────────────────────────────────
// The `title:` line lives inside the leading --- … --- frontmatter and must be
// scoped as embedded YAML, not re-tokenised as NMBL.
const fmBodyLine = findLine(/^title:/);
assertScopePresent(fmBodyLine, 'source.yaml', 'frontmatter body embeds YAML');
assertScopeAbsent(fmBodyLine, 'entity.name.tag.nmbl', 'frontmatter body is not NMBL');

// ── script: block ────────────────────────────────────────────────────────────
const scriptIntroLine = findLine(/^script:\s*$/);
// First body line is the one right after the introducer.
const scriptBodyLine = scriptIntroLine + 1;
// The line two after the last body line should be outside (after blank).
// We look for the next introducer or a line with 0-indent non-blank content.
const styleIntroLine = findLine(/^style:\s*$/);

assertScopePresent(scriptBodyLine, 'source.js', 'script: body embeds JavaScript');
assertScopeAbsent(scriptBodyLine, 'entity.name.tag.nmbl', 'script: body is not re-tokenised as NMBL');

// ── style: block ────────────────────────────────────────────────────────────
const styleBodyLine = styleIntroLine + 1;
const mdIntroLine = findLine(/:md\s*$/);
assertScopePresent(styleBodyLine, 'source.css', 'style: body embeds CSS');
assertScopeAbsent(styleBodyLine, 'entity.name.tag.nmbl', 'style: body is not NMBL');

// ── article:md block ─────────────────────────────────────────────────────────
const mdBodyLine = mdIntroLine + 1;
assertScopePresent(mdBodyLine, 'text.html.markdown', ':md body embeds Markdown');

// ── After dedent — back to normal NMBL ───────────────────────────────────────
// The line after the blank that closes the markdown block should be "div".
const divLine = findLine(/^div\s*$/);
assertScopePresent(divLine, 'entity.name.tag.nmbl', 'after :md dedent, div is entity.name.tag.nmbl');
assertScopeAbsent(divLine, 'source.js', 'after dedent, no source.js scope');
assertScopeAbsent(divLine, 'text.html.markdown', 'after dedent, no text.html.markdown scope');
assertScopeAbsent(divLine, 'source.css', 'after dedent, no source.css scope');

// ── "label Size:" must NOT create a content-block region ─────────────────────
// We tokenize a synthetic snippet rather than requiring it to be in the example
// file; re-use the loaded grammar state starting from INITIAL.
console.log('\n─ Synthetic test: "label Size:" must NOT produce a content-block region ─');

const labelLines = ['label Size:', '  indented content'];
let syntheticStack = INITIAL;
const syntheticResults = [];
for (const line of labelLines) {
  const result = grammar.tokenizeLine(line, syntheticStack);
  syntheticStack = result.ruleStack;
  syntheticResults.push({ line, tokens: result.tokens });
  const scopes = result.tokens
    .map((t) => `${JSON.stringify(line.slice(t.startIndex, t.endIndex))}:${t.scopes[t.scopes.length - 1]}`)
    .join('  ');
  console.log(`       ${JSON.stringify(line)} → ${scopes}`);
}

const labelBodyTokens = syntheticResults[1].tokens;
const labelBodyHasContentBlock = labelBodyTokens.some((t) =>
  t.scopes.includes('string.unquoted.content-block.nmbl') ||
  t.scopes.includes('source.js') ||
  t.scopes.includes('source.css') ||
  t.scopes.includes('text.html.markdown') ||
  t.scopes.includes('meta.embedded.block.javascript') ||
  t.scopes.includes('meta.embedded.block.css') ||
  t.scopes.includes('meta.embedded.block.markdown'),
);
if (labelBodyHasContentBlock) {
  console.error(
    `FAIL  "label Size:" + indented line: body has content-block scope — ` +
    `"label Size:" was incorrectly treated as a raw-block introducer.`,
  );
  failed = true;
} else {
  console.log('PASS  "label Size:" + indented line: body is NOT in a content-block region.');
}

// ── Final result ─────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(72));
if (failed) {
  console.error('\nVERIFICATION FAILED — see lines marked FAIL above.');
  process.exit(1);
} else {
  console.log('\nAll checks passed (tokenization + embed assertions).');
}
