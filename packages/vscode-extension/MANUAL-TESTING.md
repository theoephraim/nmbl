# Manual Testing — Embedded Provider Forwarding

This document describes how to verify that component completions, go-to-definition,
and hover work inside `<template lang="nmbl">` regions of `.svelte` and `.astro`
files in the Extension Development Host.

---

## Prerequisites

1. Build the extension client:
   ```
   cd packages/vscode-extension
   bun run build
   ```
2. Install the extension locally (symlinks into VS Code / Cursor / Windsurf):
   ```
   bun run install-local
   ```
   Or press **F5** in VS Code to launch the Extension Development Host directly.

3. Have the **Svelte for VS Code** extension (id: `svelte.svelte-vscode`) installed
   in the host, OR the **Astro** extension (id: `astro-build.astro-vscode`), depending
   on which file type you are testing. These host extensions provide the underlying
   TS-backed completion/definition/hover — the NMBL extension forwards to them.

---

## Test scenario — Svelte

Open `examples/svelte/src/App.svelte` (or any `.svelte` file that has a
`<template lang="nmbl">` region and a `<script>` block).

### Completion with auto-import

1. Place the cursor on a new blank line inside the `<template lang="nmbl">` block.
2. Start typing `Bad`.
3. **Expected:** The completion list includes `Badge` (or whatever PascalCase
   component is available in the project). Items that are not yet imported should
   show an auto-import `additionalTextEdit` that adds the import to the `<script>`
   block.
4. Accept the completion with Tab/Enter and confirm the import was inserted.

### Go-to-definition

1. Place the cursor on a PascalCase component name (e.g. `Badge`) inside the
   `<template lang="nmbl">` block.
2. Press **F12** (or right-click → Go to Definition).
3. **Expected:** VS Code navigates to `Badge.svelte` (or the `.ts` file that
   exports the component), the same destination the Svelte LS would give from
   the `<script>` block.

### Hover

1. Hover over a PascalCase component name inside the `<template lang="nmbl">` block.
2. **Expected:** A hover popup appears showing the component type signature,
   identical to hovering the same name in the `<script>` block.

---

## Test scenario — Astro

Open `examples/astro/src/pages/index.astro` (or any `.astro` file with a
`<template lang="nmbl">` section and a frontmatter `---…---` block).

Same three scenarios (completion, F12, hover) apply with the Astro extension as
the backing provider.

**Note:** If the `.astro` file has no frontmatter fence (`---`), forwarding
returns undefined and falls back to whatever the Astro LS normally provides.

---

## What is NOT verified by automated tests

The following require a live editor session to confirm:

- That `vscode.commands.executeCommand('vscode.executeCompletionItemProvider', …)`
  actually returns items from the Svelte/Astro language server (depends on those
  extensions being active).
- That `additionalTextEdits` from the host provider successfully insert imports
  into the `<script>` / frontmatter block.
- That the `scriptAnchorPosition` heuristic picks a position the TS service
  treats as a valid completion point (may need tuning per framework).
- Hover and definition are currently verified structurally (we pass a valid
  position to the host provider) but not end-to-end without a running server.
- Edge cases: files with multiple `<script>` blocks, `<script module>` in Svelte,
  or Astro files where frontmatter is very long.
