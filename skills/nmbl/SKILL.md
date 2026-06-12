---
name: nmbl
description: Write and edit NMBL templates correctly — .nmbl files, <template lang="nmbl"> blocks in Vue/Svelte/Astro components, and nmbl`…` tagged literals in React/Solid/Qwik. Use whenever generating or modifying NMBL syntax. Covers the syntax, per-framework control flow, the whitespace pitfalls that cause compile errors, and how to verify output.
---

# Writing NMBL

NMBL is an indentation-based shorthand for HTML (think Pug, minus the template engine) that compiles to your framework's native template syntax. Docs: https://nmbl.tools

## Core syntax

```
div#app.card.dark                      → <div id="app" class="card dark">
.box                                   → <div class="box">          (implicit div)
a.btn(href="/x" target="_blank") Go    → <a class="btn" href="/x" target="_blank">Go</a>
li > a(href="/") Home                  → <li><a href="/">Home</a></li>   (block expansion)
input(type="email" required)          → boolean attrs supported; void elements never get children
MyComponent(:prop="v")                 → PascalCase = component, kept as-is
p Inline text after the tag head
p
  | explicit text line (pipe)
  | use pipes for multi-line text
<!DOCTYPE html>                        → lines starting with < pass through verbatim
```

**Leave SVG as raw HTML.** Don't translate `<svg>…</svg>` blocks (icons, logos) into NMBL nodes — keep them verbatim under their parent (every line starts with `<`, so they pass through). SVG is generated/pasted markup, not authored structure; converting it gains nothing and churns diffs. The same goes for any pasted markup blob you wouldn't hand-edit. One constraint: all lines of the raw block must sit at the SAME indentation — a raw line indented deeper than the previous one is a parse error, so flatten the block's internal indentation:

```
.icon
  <svg viewBox="0 0 24 24">
  <path d="…"/>
  </svg>
```

- **Nesting is indentation** (2 spaces). Children go on indented lines below the parent.
- **Attributes**: whitespace-separated inside parens; parens may span multiple lines; values: `"str"`, `'str'`, `` `template ${x}` ``, bare (`colspan=2`), or raw expression `onClick={() => f(x)}`.
- **Bound shorthand**: `:name` alone expands to `:name="name"`.

## Comments (two tiers)

```
// stripped from output (dev notes — safe for TODOs)
//! rendered as an HTML comment in output
button(
  type="submit"
  // disabled          ← comment out individual attributes
  /* aria-label="x" */
) Save
```

## Content blocks (raw bodies)

A **glued** trailing `:` or `:mode` makes all more-indented lines raw text:

```
script:
  const x = 1 < 2;     // not parsed as NMBL
style:
  .a { color: red }
article:md
  ## markdown (transformed only if a filter is registered)
```

### Markdown sections (`:md`)

`:md` works out of the box in EVERY integration — prefer it over stacks of inline `<h3>`/`<p>`/`<code>` for prose-heavy sections:

```
.prose:md
  ### A heading

  A paragraph with [links](/x), `code`, and **bold**. Blank lines separate
  paragraphs. Raw inline HTML works too (<a target="_blank" …>).
```

- **Astro** (`@nmbl-lang/astro`): renders through the project's own Astro markdown pipeline — same remark/rehype plugins and syntax highlighting as `.md` files.
- **Vue / Svelte / `.nmbl` files / `nmbl`…`` JSX templates**: a default CommonMark+GFM renderer (`@nmbl-lang/core/markdown`) is built in. Override with `filters: { md }` (vite plugin options accept async filters; svelte via `compiler.filters`).
- The rendered HTML is spliced into the host template, so `{expr}` / `{{ expr }}` interpolation and `<Component />` tags still work inside the prose (MDX-like); braces inside code spans/fences are auto-escaped so they never parse as host expressions.
- **JSX targets**: a content-mode body compiles to `dangerouslySetInnerHTML` on the host element (raw HTML is not JSX). A bare `:md` block with no host element is a compile error in jsx — attach it to an element (`div:md`).
- Body is dedented relative to the block — relative indentation (nested lists) is preserved.
- Core `compile()` takes sync `filters`; the default md filter is importable: `import { mdFilter } from '@nmbl-lang/core/markdown'`.

## Control flow — one notation, host-native output

```
@if(cond)            @elseif(other)            @else
@each(item of items :key="item.id")
@each(item, i of items :key="item.id")        ← optional index
```

- The `@each` expression also accepts Svelte's form (`items as item, i (item.id)`); both compile to whatever the host needs. Prefer the `of` form.
- `@if` conditions are plain host-JS, passed through verbatim.

| Target (framework option) | Output |
|---|---|
| `svelte` | `{#if}…{:else}…{/if}`, `{#each items as item, i (key)}`; also `@await`/`@key`/`@snippet`, `{@html x}` |
| `vue` | `<template v-if="…">…</template>`, `<template v-for="… of …" :key="…">` |
| `astro` / `jsx` | `{cond ? (…) : (…)}`, `{items.map((item, i) => (…))}`; jsx puts `key={…}` on the loop's single root element |
| `html` | no @-blocks (compile error) |

**Errors, not silent wrongness**: `@await`/`@key`/`@snippet` outside Svelte, `{@html}` in Vue (use a `v-html` attribute), multi-root `@each` body with `:key` in jsx — all hard compile errors with hints. Trust the error messages.

## Interpolation is the HOST's syntax

`{{ msg }}` in Vue, `{expr}` in Svelte/Astro, and inside `nmbl\`…\`` JSX literals either `${hole}` holes or plain `{expr}` text. NMBL never parses these — it passes them through.

## Pitfalls (these cause real compile errors)

1. **Attribute parens must be GLUED to the tag head**: `a(href="/")` ✓ — `a (href="/")` is the text `(href="/")`.
2. **Selectors must be glued**: `div.card` ✓ — `div .card` is text.
3. **A glued trailing `:` at end of line opens a content block.** `note:` alone on a line captures its children as raw text. Inline text ending in a colon is fine when there's a space earlier on the line (`label Size:` is text), but a single word + `:` is always a content-block introducer.
4. **Text lines need `|`** (or must start with `<` for raw HTML). A bare text line produces a diagnostic.
5. **Block expansion `>` needs surrounding spaces**: `li > a`. A `>` later in inline text passes through as-is (only a `>` directly after the tag head/attrs is block expansion — and only when a valid element follows).
6. **Don't mix tabs and spaces**; pick 2-space indentation.
7. In Vue files, plain `v-if`/`v-for`/`@click.stop`/`#slot` attributes also pass straight through — @-blocks are optional sugar.

## Verify your output

NMBL fails loudly with exact source positions — compile to check, don't eyeball:

```js
// in a project depending on @nmbl-lang/core
import { compile, decompile } from '@nmbl-lang/core';
const { html, errors } = compile(src, { framework: 'vue' }); // 'svelte' | 'astro' | 'jsx' | 'html'
// errors: [{ message, span: { start: { line, column } } }]
```

Or just run the project's build/dev — every integration surfaces NMBL errors at exact positions. When converting existing HTML, don't hand-translate: `decompile(html)` produces idiomatic NMBL.
