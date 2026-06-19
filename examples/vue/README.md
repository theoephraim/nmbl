# NMBL + Vue Example

This example demonstrates how to use NMBL syntax with Vue Single File Components (SFCs).

## Intellisense & Syntax Highlighting Setup

For full intellisense support and syntax highlighting:

### Required VSCode Extensions
1. **Vue - Official** (`Vue.volar`) — Vue language support + TypeScript integration (this supersedes the old "TypeScript Vue Plugin"; no separate TS plugin is needed).
2. **NMBL Extension** — install from `packages/vscode-extension` (`bun run build && bun run install-local`) for NMBL syntax highlighting, completion, and auto-import.

### How the two cooperate
- **Type-checking** (variables, `@if`/`@each` narrowing, component prop types, errors) comes from the Vue extension via the `@nmbl-lang/vue-language-plugin` configured in `tsconfig.json`.
- **Highlighting, tag/attribute/component completion, and auto-import** come from the NMBL extension.

### Setup Steps
1. Install the extensions above.
2. Open this folder (`examples/vue`) in VSCode.
3. Run "TypeScript: Select TypeScript Version" → "Use Workspace Version" (`Cmd/Ctrl+Shift+P`).
4. Reload the window (`Cmd/Ctrl+R`).

> Tip: `tsconfig.json` here sets `vueCompilerOptions.strictTemplates: true`, so unknown components and unknown props are flagged in NMBL templates too.

### What You Should See
- ✅ Variables from `<script>` recognized in `<template lang="nmbl">` (completion + hover inside `{{ }}` and bindings)
- ✅ Component prop **types** checked; unknown props flagged (with `strictTemplates`)
- ✅ `@if`/`@each` type-narrowing; NMBL compile errors + lint shown as squiggles
- ✅ Component name, HTML tag, attribute, event, and directive completion (+ auto-import)
- ✅ CSS classes linked between `<style>` and template
- ✅ Syntax highlighting for NMBL templates, including embedded `:md` (with fenced code)

## Features

- Vue 3 with Composition API (`<script setup>`)
- NMBL template syntax using `lang="nmbl"`
- Interactive to-do list application with:
  - Login/logout toggle
  - Dynamic item management (add/remove)
  - Reactive state management

## Setup

```bash
# Install dependencies
bun install

# Start development server
bun run dev
```

## How it works

The NMBL Vite plugin preprocesses Vue SFC files, transforming NMBL template syntax into standard HTML that Vue can understand.

### Template Syntax

In your Vue components, use `lang="nmbl"` on the template tag:

```vue
<template lang="nmbl">
  div#app
    h1.title My Vue App
    button(@click="handleClick") Click me
    ul
      li(v-for="item in items" :key="item.id")
        | {{ item.name }}
</template>
```

This gets compiled to standard Vue template syntax before Vue processes it.

### Vue Directives

All Vue directives work as expected:
- `v-if`, `v-else`, `v-show`
- `v-for`
- `v-model`
- `@click`, `@input`, etc.
- `:prop` bindings

### Interpolation

Use Vue's standard `{{ }}` interpolation syntax for dynamic content.