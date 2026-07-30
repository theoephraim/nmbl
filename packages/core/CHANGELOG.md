# Changelog

## 0.2.0
<sub>2026-07-30</sub>

-  *(minor)* - Compiler improvements to attribute and text handling:
  - Static and dynamic classes now merge into a single `class` binding for the brace-binding frameworks (JSX, Svelte, Astro). Previously `.foo(:class="active")` emitted a duplicate `class` attribute, which is invalid.
  - Bound attributes (`:name="expr"`) emit framework-appropriate syntax — `name={expr}` for JSX/Svelte/Astro, `:name="expr"` for Vue and HTML.
  - Unbound Vue expression attributes are now a compile error rather than silently emitting the wrong thing.
  - A trailing `\` gives explicit control over whitespace at the end of a text line.
  - `$` is allowed in attribute names.
-  *(minor)* - `:md` content blocks now work in every integration, rendered through the host project's own Markdown pipeline rather than a bundled one — Astro blocks go through the project's resolved markdown config, so plugins and syntax-highlighting settings apply. Generated markup is also pretty-printed and indented to match the surrounding structure instead of being emitted flat.
-  *(minor)* - Standalone `.nmbl` files support YAML frontmatter.
-  *(patch)* - Regenerate the Monarch and tree-sitter artifacts so they pick up `$` in attribute names, and rename the raw content-block scope from `string.unquoted.content-block.nmbl` to `text.content-block.nmbl` — a raw block's body is text in the output, so a string scope made it render in the theme's string color.
-  *(patch)* - Editor-grammar fixes carried by the generated artifacts (TextMate, Monarch, tree-sitter):
  - `:md` blocks highlight as Markdown instead of raw code, with fuller Markdown coverage and per-language highlighting of fenced code inside them.
  - Interpolation braces pair correctly — `{{ }}` reads as one bracket pair rather than nested, so the closing `}}` is no longer flagged as unmatched.
  - A stray quote no longer poisons the highlighting of every following line.
  - Blank lines round-trip through compile and decompile.
