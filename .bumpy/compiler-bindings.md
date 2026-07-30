---
"@nmbl-lang/core": minor
---

Compiler improvements to attribute and text handling:

- Static and dynamic classes now merge into a single `class` binding for the brace-binding frameworks (JSX, Svelte, Astro). Previously `.foo(:class="active")` emitted a duplicate `class` attribute, which is invalid.
- Bound attributes (`:name="expr"`) emit framework-appropriate syntax — `name={expr}` for JSX/Svelte/Astro, `:name="expr"` for Vue and HTML.
- Unbound Vue expression attributes are now a compile error rather than silently emitting the wrong thing.
- A trailing `\` gives explicit control over whitespace at the end of a text line.
- `$` is allowed in attribute names.
