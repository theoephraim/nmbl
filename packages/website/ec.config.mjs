import { defineEcConfig } from 'astro-expressive-code';
import nmblGrammar from '@nmbl-lang/vscode-extension/syntaxes/nmbl.tmLanguage.json' with { type: 'json' };
import nmblTemplateInjection from './src/grammars/nmbl-template-injection.json' with { type: 'json' };
import nmblTaggedInjection from './src/grammars/nmbl-tagged-injection.json' with { type: 'json' };
import markdownEmbedded from './src/grammars/markdown-embedded.json' with { type: 'json' };
import { pluginIndentRainbow } from './src/ec-indent-rainbow.mjs';

// Expressive Code config lives here (not inline in astro.config) because the
// `<Code>` component requires the options to be loadable from a standalone
// file — a non-serializable `plugins` function in astro.config breaks it.

// Highlight NMBL inside `<template lang="nmbl">` blocks of framework code samples.
// Shiki applies an injection only when BOTH `injectTo` and the grammar's own
// `injectionSelector` target the host grammar's ROOT scope (Vue roots at
// `text.html.vue`, Svelte at `source.svelte`, Astro at `source.astro`). Each host
// gets its OWN single-scope injection — a combined multi-scope selector breaks
// Vue's special `<template>` handling.
const nmblTemplateInjections = [
  ['vue', 'text.html.vue'],
  ['svelte', 'source.svelte'],
  ['astro', 'source.astro'],
].map(([host, scope]) => ({
  ...nmblTemplateInjection,
  name: `nmbl-in-${host}`,
  scopeName: `inline.nmbl-in-${host}`,
  injectionSelector: `L:${scope}`,
  injectTo: [scope],
}));

export default defineEcConfig({
  themes: ['github-dark'],
  plugins: [pluginIndentRainbow()],
  shiki: {
    langs: [
      { ...nmblGrammar, name: 'nmbl' },
      // NMBL-in-`<template lang="nmbl">` injections for vue/svelte/astro samples.
      ...nmblTemplateInjections,
      // NMBL inside `nmbl`…`` tagged templates for JSX (react/solid/qwik) samples.
      { ...nmblTaggedInjection, name: 'nmbl-tagged', injectTo: ['source.tsx', 'source.ts', 'source.js', 'source.jsx'] },
      // Lightweight Markdown grammar for `:md` blocks shown in code samples.
      // Registered as `markdown`/`text.html.markdown` so it loads before the
      // Vue grammar pulls in Shiki's full markdown grammar — Shiki then skips
      // that one (name already loaded), avoiding the conflicts it causes. See
      // the grammar file for the full rationale.
      markdownEmbedded,
    ],
  },
});
