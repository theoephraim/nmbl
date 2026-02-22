# NMBL + Vue Example

This example demonstrates how to use NMBL syntax with Vue Single File Components (SFCs).

## Intellisense & Syntax Highlighting Setup

For full intellisense support and syntax highlighting:

### Required VSCode Extensions
1. **NMBL Extension** - Install from `packages/vscode-extension` for NMBL syntax highlighting
2. **Vue - Official** (Vue.volar) - For Vue language support
3. **TypeScript Vue Plugin** (Vue.vscode-typescript-vue-plugin) - For TypeScript integration

### Setup Steps
1. Install the required extensions
2. Open this folder (`examples/vue`) in VSCode
3. Select TypeScript version:
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Run "TypeScript: Select TypeScript Version"
   - Choose "Use Workspace Version"
4. Restart VSCode or reload the window (`Cmd+R` / `Ctrl+R`)

### What You Should See
- ✅ Variables from `<script>` recognized in `<template lang="nmbl">`
- ✅ Component props and events with intellisense
- ✅ CSS classes linked between `<style>` and template
- ✅ Vue directives with autocomplete
- ✅ Syntax highlighting for NMBL templates

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