# NMBL Vue Intellisense Setup Guide

## Overview

This guide helps you set up full intellisense support for NMBL templates in Vue SFCs, including:
- Variable recognition between `<script>` and `<template lang="nmbl">`
- Component prop/event autocomplete
- CSS class linking between `<style>` and template
- Vue directive support

## Prerequisites

1. **VSCode** (or compatible editor like Cursor/Windsurf)
2. **Node.js** and **Bun** installed
3. This Vue example project with dependencies installed (`bun install`)

## Required Extensions

Install these VSCode extensions:

1. **Vue - Official** (`Vue.volar`)
   - Provides Vue language server support
   - Required for intellisense in Vue files

2. **TypeScript Vue Plugin** (`Vue.vscode-typescript-vue-plugin`)
   - Integrates TypeScript with Vue
   - Enables type checking in templates

3. **NMBL** (from `packages/vscode-extension`)
   - Provides NMBL syntax highlighting
   - Install locally: `cd packages/vscode-extension && bun run install-local`

## Setup Steps

### 1. Open the Correct Folder
**Important:** Open the `examples/vue` folder directly in VSCode, not the monorepo root.
```bash
code examples/vue
```

### 2. Select TypeScript Version
1. Open any `.vue` file
2. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
3. Run: **"TypeScript: Select TypeScript Version"**
4. Choose: **"Use Workspace Version"**

### 3. Restart Vue Language Server
1. Press `Cmd+Shift+P` / `Ctrl+Shift+P`
2. Run: **"Vue: Restart Vue Server"**
   - Alternative: **"Developer: Reload Window"**

### 4. Verify Setup
Run the diagnostic script:
```bash
bun run check-intellisense.js
```

## Testing Intellisense

Open `src/App.vue` and verify:

1. **Script Variables in Template**
   - Type `{{ ` in the template
   - Should see autocomplete for `loggedIn`, `items`, etc.

2. **Component Props**
   - Type `<ItemCard `
   - Should see prop suggestions like `title`, `description`, etc.

3. **Vue Directives**
   - Type `v-` on any element
   - Should see `v-if`, `v-for`, `v-model`, etc.

4. **CSS Classes**
   - Classes defined in `<style>` should be recognized in template
   - Hover over class names for definitions

## Troubleshooting

### Intellisense Not Working?

1. **Check Vue Language Server Output**
   - View → Output → Select "Vue Language Server"
   - Look for any errors

2. **Verify Plugin is Loaded**
   - In the output, look for: `Loading @nmbl/vue-language-plugin`
   - If not present, the plugin isn't being loaded

3. **Clear TypeScript Cache**
   ```bash
   rm -rf node_modules/.vite
   rm -rf node_modules/.cache
   bun install
   ```

4. **Full Reset**
   - Close VSCode completely
   - Delete `node_modules` folder
   - Run `bun install`
   - Reopen VSCode
   - Follow setup steps again

### Common Issues

**Issue:** "Cannot find module '@nmbl/vue-language-plugin'"
**Solution:** The plugin isn't built. Run:
```bash
cd ../../packages/vue-language-plugin-nmbl
bun run build
cd -
bun install
```

**Issue:** Variables show as "unused" in script
**Solution:** The template isn't being parsed. Check:
- Template has `lang="nmbl"` attribute
- No NMBL compilation errors (check build output)
- Vue language server is running

**Issue:** No autocomplete in template
**Solution:** TypeScript version issue. Ensure:
- Using workspace TypeScript version
- TypeScript 5.0+ installed
- `typescript.enablePromptUseWorkspaceTsdk: true` in settings

## How It Works

1. **NMBL Compilation**
   - The `@nmbl/vue-language-plugin` compiles NMBL → HTML
   - Maintains source mapping for intellisense

2. **Vue Language Server**
   - Parses the compiled HTML as Vue template
   - Connects template to script context
   - Provides type information

3. **TypeScript Integration**
   - Analyzes component props/events
   - Provides type checking
   - Enables refactoring support

## Advanced Configuration

### Custom Components

For intellisense in custom components:

1. Ensure components are properly typed in TypeScript
2. Export components with proper type definitions
3. Import components in consuming files

### Global Components

Register global components in a `.d.ts` file:
```typescript
declare module 'vue' {
  export interface GlobalComponents {
    ItemCard: typeof import('./components/ItemCard.vue')['default']
    Badge: typeof import('./components/Badge.vue')['default']
    Button: typeof import('./components/Button.vue')['default']
  }
}
```

## Need Help?

If intellisense still isn't working:

1. Check the [Vue Language Tools docs](https://github.com/vuejs/language-tools)
2. File an issue in the NMBL repository with:
   - Your VSCode version
   - Installed extensions list
   - Vue Language Server output logs
   - Steps to reproduce the issue