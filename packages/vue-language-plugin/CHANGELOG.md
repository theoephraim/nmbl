# Changelog

## 0.2.0
<sub>2026-07-30</sub>

-  *(minor)* - Real type-checking for nmbl templates in Vue SFCs. The plugin now compiles through `@vue/language-core`'s `compileTemplate()`, so `@if`/`@each` produce genuine IF/FOR AST nodes and type narrowing works inside them. NMBL compile errors and lint findings surface as diagnostics in `.vue` templates.
