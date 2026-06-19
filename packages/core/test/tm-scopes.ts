// Tokenize NMBL lines with the GENERATED TextMate grammar and report the scope
// of each token — so we can assert that highlighting honors selector/attr
// gluing (e.g. `div .card` must NOT scope `.card` as a class).
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import * as oniguruma from 'vscode-oniguruma';
import * as vsctm from 'vscode-textmate';

const require = createRequire(import.meta.url);
const ROOT = resolve(import.meta.dirname, '../../..');
const GRAMMAR = resolve(ROOT, 'packages/vscode-extension/syntaxes/nmbl.tmLanguage.json');
const WASM = resolve(dirname(require.resolve('vscode-oniguruma')), 'onig.wasm');

const onig = (async () => {
  await oniguruma.loadWASM(readFileSync(WASM).buffer);
  return {
    createOnigScanner: (p: string[]) => new oniguruma.OnigScanner(p),
    createOnigString: (s: string) => new oniguruma.OnigString(s),
  };
})();

const registry = new vsctm.Registry({
  onigLib: onig,
  loadGrammar: async () => vsctm.parseRawGrammar(readFileSync(GRAMMAR, 'utf8'), GRAMMAR),
});

export interface Tok { text: string; scopes: string[] }

export async function tokenize(line: string): Promise<Tok[]> {
  const grammar = await registry.loadGrammar('source.nmbl');
  if (!grammar) throw new Error('failed to load grammar');
  const r = grammar.tokenizeLine(line, vsctm.INITIAL);
  return r.tokens.map(t => ({ text: line.slice(t.startIndex, t.endIndex), scopes: t.scopes }));
}

/** The most-specific (last) scope on the token covering char offset `at`. */
export async function scopeAt(line: string, at: number): Promise<string> {
  let idx = 0;
  for (const t of await tokenize(line)) {
    const end = idx + t.text.length;
    if (at >= idx && at < end) return t.scopes[t.scopes.length - 1];
    idx = end;
  }
  return '';
}

/** The most-specific scope on the token covering the FIRST char of `needle`. */
export async function scopeOf(line: string, needle: string): Promise<string> {
  return scopeAt(line, line.indexOf(needle));
}

// CLI: print token/scope table for each arg line
if (import.meta.main) {
  const lines = process.argv.slice(2);
  for (const line of lines) {
    console.log(`\n>>> ${JSON.stringify(line)}`);
    for (const t of await tokenize(line)) {
      console.log(`   ${JSON.stringify(t.text).padEnd(22)} ${t.scopes[t.scopes.length - 1]}`);
    }
  }
}
