# @nmbl-lang/language-server

A [Volar 2.4](https://github.com/volarjs/volar.js) language server that provides IDE intelligence for the NMBL template language.

## What it does

The server handles two document kinds:

- **Standalone `.nmbl` files** — the entire file is NMBL source.
- **Embedded regions in `.svelte` and `.astro` files** — the server scans for `<template lang="nmbl">` blocks and activates only on files that contain one (files without that tag are ignored completely, so the Svelte / Astro language servers are not disturbed).

For each recognized document the server:

1. Compiles the NMBL source via `@nmbl-lang/core`'s `compile()`, choosing the right framework target (`svelte` / `astro` / `html`).
2. Produces a Volar `VirtualCode` tree: a root `nmbl` code plus an embedded `html` virtual code that carries the compiled output.
3. Exposes **source mappings** that link every token in the generated HTML back to the original position in the host document (accounting for the leading indentation that was stripped before compilation).
4. Feeds the virtual HTML code to [`volar-service-html`](https://github.com/volarjs/services) to provide HTML completions, hover documentation, and HTML diagnostics for free.
5. Surfaces NMBL compile errors (syntax errors, unsupported control-flow blocks, etc.) as LSP diagnostics, with spans pointing at the correct position in the original file.

## What users get

- **Diagnostics** — NMBL syntax errors and unsupported block types highlighted in the editor.
- **HTML completions and hover** — tag names, attribute names, and values are suggested via the embedded HTML language service.
- **Go-to-definition / find-references** — Volar maps tokens in the compiled HTML back to the NMBL source, so editor navigation works on the original file.

## What it deliberately does NOT do

- **Framework-type-aware expression checking** — NMBL control-flow expressions (`@if(cond)`, `@each(items as item)`) are compiled to Svelte or Astro syntax in the virtual code, but the server does not run a full TypeScript/JavaScript type-checker over them. See [sveltejs/language-tools#339](https://github.com/sveltejs/language-tools/issues/339) for context on why deep expression checking in embedded languages is non-trivial. The Astro Language Server has no plugin hook that would allow injecting a second virtual language service either.
- **Vue single-file components** — `.vue` files with `<template lang="nmbl">` are handled by the separate [`@nmbl-lang/vue-language-plugin`](../vue-language-plugin) Volar plugin, which integrates directly into the Vue language toolchain. This server intentionally ignores `languageId: 'vue'` to avoid double-reporting diagnostics.

## How the VSCode extension wires it

The extension (`packages/vscode-extension`) contributes:

- TextMate grammars that inject `source.nmbl` syntax highlighting into `.svelte`, `.astro`, and `.vue` files wherever a `<template lang="nmbl">` region appears.
- A language client (`client/extension.ts`) that spawns this server via IPC and activates on `onLanguage:nmbl`, `onLanguage:svelte`, and `onLanguage:astro`.

The client passes `{ language: 'svelte' }` and `{ language: 'astro' }` document selectors to the server. For each open document the server's `createVirtualCode` inspects the text; if no `<template lang="nmbl">` is present the function returns `undefined` and Volar leaves the file alone.
