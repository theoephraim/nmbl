// Regression: the `astro.nmbl` TextMate injection must actually highlight the
// body of `<template lang="nmbl">` inside `.astro` files.
//
// Astro's base grammar greedily scopes `<template>` content as plain text under
// `source.astro`, so a normal-priority injection never gets a turn — the
// injection MUST be high-priority (`L:`). It also must not subtract a bare
// `source` scope, which matches `source.astro` itself and cancels the whole
// selector. This test reproduces the greedy base with a stub and tokenizes the
// real on-disk grammar through the actual vscode-textmate engine.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import * as oniguruma from 'vscode-oniguruma';
import * as vsctm from 'vscode-textmate';

const require = createRequire(import.meta.url);
const SYN = resolve(import.meta.dirname, '../syntaxes');
const WASM = resolve(dirname(require.resolve('vscode-oniguruma')), 'onig.wasm');

const onig = (async () => {
  await oniguruma.loadWASM(readFileSync(WASM).buffer);
  return {
    createOnigScanner: (p: string[]) => new oniguruma.OnigScanner(p),
    createOnigString: (s: string) => new oniguruma.OnigString(s),
  };
})();

const loadJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

// Greedy stub reproducing Astro's base grammar: `<template>` content is scoped
// as plain `text.astro` under `source.astro`. A normal-priority injection loses
// to this; only an `L:` (high-priority) injection wins.
const astroStub = {
  scopeName: 'source.astro',
  patterns: [
    {
      begin: '(?i)(<template[^>]*>)',
      end: '(</template>)',
      name: 'meta.tag.template.astro',
      patterns: [{ match: '[^\\n]+', name: 'text.astro' }],
    },
    { match: '[^\\n]+', name: 'text.astro' },
  ],
};

// A `<template lang="nmbl">` block; lines 1–4 are the nmbl body.
const SAMPLE = [
  '<template lang="nmbl">',
  'div#app',
  '  h1 {title}',
  '  ul.list',
  '    li.item Hi',
  '</template>',
];

async function nmblRegionLines(injectionSelector: string): Promise<number> {
  const injection = {
    ...loadJson(resolve(SYN, 'astro-nmbl.tmLanguage.json')),
    injectionSelector,
  };
  const grammars: Record<string, unknown> = {
    'source.astro': astroStub,
    'astro.nmbl': injection,
    'source.nmbl': loadJson(resolve(SYN, 'nmbl.tmLanguage.json')),
  };
  const registry = new vsctm.Registry({
    onigLib: onig,
    getInjections: (scope) => (scope === 'source.astro' ? ['astro.nmbl'] : []),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loadGrammar: async (scope) => (grammars[scope] as any) ?? { scopeName: scope, patterns: [] },
  });
  const grammar = await registry.loadGrammar('source.astro');
  if (!grammar) throw new Error('failed to load source.astro');

  let rule = vsctm.INITIAL;
  let count = 0;
  SAMPLE.forEach((line, i) => {
    const r = grammar.tokenizeLine(line, rule);
    rule = r.ruleStack;
    if (i >= 1 && i <= 4 && r.tokens.some((t) => t.scopes.some((s) => s.includes('source.nmbl')))) {
      count++;
    }
  });
  return count;
}

describe('astro <template lang="nmbl"> injection', () => {
  const selector = () => loadJson(resolve(SYN, 'astro-nmbl.tmLanguage.json')).injectionSelector as string;

  test('the on-disk grammar highlights every line of the nmbl body', async () => {
    expect(await nmblRegionLines(selector())).toBe(4);
  });

  test('is a high-priority (L:) injection — Astro greedily consumes template content', () => {
    expect(selector().startsWith('L:')).toBe(true);
  });

  test('regression: a normal-priority selector leaves the region unhighlighted', async () => {
    expect(await nmblRegionLines('source.astro - (meta.embedded | source)')).toBe(0);
  });
});
