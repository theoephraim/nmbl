# Changelog

## 0.2.0
<sub>2026-07-30</sub>

-  *(minor)* - `:md` content blocks now work in every integration, rendered through the host project's own Markdown pipeline rather than a bundled one — Astro blocks go through the project's resolved markdown config, so plugins and syntax-highlighting settings apply. Generated markup is also pretty-printed and indented to match the surrounding structure instead of being emitted flat.
-  *(minor)* - Standalone `.nmbl` files support YAML frontmatter.
