# >< NMBL

**N**o **M**ore **B**rackets **L**anguage — a shorthand notation for HTML, built for modern web frameworks and token efficiency.

> ⚠️ **Early development.** The core compiler is solid and well-tested; the framework integrations work but are still maturing. Packages are not yet published to npm.

NMBL strips the noise from HTML — closing tags, angle brackets, `id`/`class` boilerplate — while compiling to plain HTML that your framework already understands. A typical template is 30–40% shorter than the equivalent HTML, which means less to read for you and fewer tokens for your AI.

```
#app
  header.site-header
    nav
      a(href="/features") Features
      a.btn.btn-primary(href="/signup") Get Started
  main
    h1 Ship faster with less code
    p.lead Stop writing closing tags.
```

compiles to:

```html
<div id="app">
  <header class="site-header">
    <nav>
      <a href="/features">Features</a>
      <a class="btn btn-primary" href="/signup">Get Started</a>
    </nav>
  </header>
  <main>
    <h1>Ship faster with less code</h1>
    <p class="lead">Stop writing closing tags.</p>
  </main>
</div>
```

## Why not Pug?

Pug proved that indentation-based HTML is easier to read and write — but it was built as a complete templating engine for a pre-framework era (mixins, extends, interpolation, conditionals, its own expression language). Frameworks handle all of that better now, and Pug is effectively unmaintained.

NMBL keeps the good part — the shorthand notation — and drops the template-engine ambitions. Your framework owns the logic; NMBL owns the brevity.

## Features

- **Tagged template literal transform** — use `nmbl\`…\`` in `.tsx`/`.jsx` files with React, Solid, Qwik, or Preact; the Vite plugin compiles it to JSX at build time with zero runtime overhead. `.card` becomes `className` for React and `class` for Solid/Qwik
- **CSS-style selectors** — `#id` and `.class` shorthand, implicit `div` (`#app`, `.card.dark`)
- **Block expansion** — inline single children: `li > a(href="/") Home`
- **Multiline attributes** — paren-wrapped, whitespace-separated, with quoted strings, template literals, and `={expr}` raw expressions
- **Comments that actually work** — `//` is stripped from output, `//!` renders an HTML comment, and you can comment out *individual attributes* with `//` or `/* */` inside an attribute list (something HTML and every template language lack)
- **Framework directives pass through** — `v-if`, `@click.stop`, `bind:value={...}`, `client:load`, `#slot` shorthand all parse as plain attributes
- **Control flow blocks** — `@if` / `@elseif` / `@else` / `@each` / `@await` / `@key` / `@snippet` compile to the host framework's native syntax. `@each` accepts one canonical form everywhere: `@each(item of items :key="item.id")` — the `:key` attribute sits in the same paren list, whitespace-separated like any other NMBL attribute. Svelte's `as`-form (`@each(items as item, i)`) is also accepted. Templates using the canonical form are **portable across frameworks**: the same `@each` source compiles to `{#each items as item (item.id)}` in Svelte, `<template v-for="item of items" :key="item.id">` in Vue, and `{items.map((item) => …)}` in Astro (key not emitted). Vue compiles `@if`/`@elseif`/`@else` to renderless `<template v-if>`/`<template v-else-if>`/`<template v-else>` wrappers. Svelte gets the full block set (`@await`, `@key`, `@snippet`). Astro supports only `@if` and `@each`. Plain HTML treats `@`-blocks as hard errors
- **Content blocks** — `script:` / `style:` capture nested content verbatim; named modes like `article:md` hand content to a filter you register via the compiler API
- **Bidirectional** — a decompiler converts existing HTML to clean, idiomatic NMBL (round-trip tested)
- **Built for tooling** — character-level source mappings, diagnostics with precise spans, real source maps for Svelte, full Vue IntelliSense via a Volar plugin

## Packages

| Package | Description |
|---|---|
| [`@nmbl/parser`](packages/parser) | Core lexer, parser, compiler (HTML + source mappings), and HTML→NMBL decompiler |
| [`@nmbl/vite-plugin`](packages/vite-plugin) | Vite plugin: `.nmbl` files and `<template lang="nmbl">` in Vue SFCs |
| [`@nmbl/svelte`](packages/svelte) | Svelte preprocessor with V3 source maps |
| [`@nmbl/astro`](packages/astro) | Astro integration |
| [`@nmbl/vue-language-plugin`](packages/vue-language-plugin-nmbl) | Volar plugin: full IntelliSense for NMBL templates in Vue SFCs |
| [`@nmbl/vscode-extension`](packages/vscode-extension) | Syntax highlighting for `.nmbl` files and embedded templates (install from repo) |
| [`@nmbl/website`](packages/website) | [nmbl.tools](https://nmbl.tools) — docs and interactive playground |

## Usage

### Vue

```ts
// vite.config.ts
import vue from '@vitejs/plugin-vue';
import nmbl from '@nmbl/vite-plugin';

export default defineConfig({
  plugins: [
    nmbl(), // must come before vue()
    vue(),
  ],
});
```

```jsonc
// tsconfig.json — enables IntelliSense via Volar
{
  "vueCompilerOptions": {
    "plugins": ["@nmbl/vue-language-plugin"]
  }
}
```

Then use `<template lang="nmbl">` in your SFCs, including `@if`/`@each` blocks which compile to Vue's renderless `<template v-if>`/`<template v-for>` wrappers:

```nmbl
<template lang="nmbl">
@if(loggedIn)
  p Welcome back!
@each(item of items :key="item.id")
  li {{ item.name }}
</template>
```

See [examples/vue](examples/vue).

### Svelte

```js
// svelte.config.js
import { nmblPreprocess } from '@nmbl/svelte';

export default {
  preprocess: [nmblPreprocess()],
};
```

Then use `<template lang="nmbl">` blocks in your components. See [examples/svelte](examples/svelte).

### Astro

```js
// astro.config.mjs
import nmbl from '@nmbl/astro';

export default defineConfig({
  integrations: [nmbl()],
});
```

See [examples/astro](examples/astro).

### React / Solid / Qwik (JSX)

Use the `nmbl\`…\`` tagged template literal tag in any `.tsx`/`.jsx` file. The plugin compiles it away at build time — zero runtime, full source maps.

```ts
// vite.config.ts
import react from '@vitejs/plugin-react';
import nmbl from '@nmbl/vite-plugin';

export default defineConfig({
  plugins: [
    nmbl({ jsx: { framework: 'react' } }), // must come before react()
    react(),
  ],
});
```

```tsx
// src/App.tsx
import { useState } from 'react';
import { nmbl } from '@nmbl/vite-plugin/tag'; // compile-time-only stub

function Card({ item }) {
  const [open, setOpen] = useState(false);
  return nmbl`
    div.card
      //! Rendered as an HTML comment in the output
      h3 ${item.name}
      button(onClick=${() => setOpen(!open)}) Toggle
      @if(${open})
        p.detail ${item.description}
  `;
}
```

The stub import (`@nmbl/vite-plugin/tag`) provides TypeScript types and throws at runtime if the plugin is missing. Compiled away, it leaves no trace in your bundle.

Transform rules:
- `.class` / `#id` → `className` for React/Preact, `class` for Solid/Qwik
- `@if(${cond})` → `{cond && …}` ternary; `@if`/`@else` → full ternary
- `@each(item of ${items} :key="item.id")` → `{items.map((item) => …)}` with `key={item.id}` on the root
- `${expr}` holes in text position → `{expr}`; in attribute position → `={expr}`
- `//` comments stripped; `//!` rendered as HTML comments

For Solid, pass `framework: 'solid'`; for Qwik/Preact, `framework: 'qwik'` / `framework: 'preact'`.

See [examples/react](examples/react) and [examples/solid](examples/solid).

### Compiler API

```ts
import { compile, decompile } from '@nmbl/parser';

const { html, errors } = compile('p.lead Hello world');
const nmbl = decompile('<p class="lead">Hello world</p>');
```

## Architecture

The NMBL grammar is defined once in `packages/parser/src/nmbl-grammar.ts` using [monogram](https://github.com/johnsoncodehk/monogram) (pulled from a pinned GitHub commit and bundled into `@nmbl/parser`'s dist). The runtime lexer/parser executes that grammar directly (`createLexer`/`createParser`), and `packages/parser/scripts/gen-artifacts.ts` derives the editor artifacts from the same definition:

- The TextMate grammar + VS Code language configuration (checked into `packages/vscode-extension`)
- The tree-sitter grammar (`packages/parser/generated/tree-sitter/nmbl`)
- A Monarch (Monaco) tokenizer and typed CST node definitions (`packages/parser/generated`)

This means syntax highlighting can never drift from what the parser actually accepts. To regenerate the editor artifacts after changing the grammar, run `bun run gen` inside `packages/parser`. Any local monogram patches live in `patches/monogram.patch`.

## Development

This is a [turborepo](https://turbo.build/) monorepo using [bun](https://bun.sh/) as the package manager.

```sh
bun install
bun run build:libs   # build all packages (except the website)
bun run test         # run tests (vitest)
```

In an individual package, `bun run tbuild` builds it along with its dependencies.
