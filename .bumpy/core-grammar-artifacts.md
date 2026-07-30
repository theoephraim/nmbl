---
"@nmbl-lang/core": patch
---

Regenerate the Monarch and tree-sitter artifacts so they pick up `$` in attribute names, and rename the raw content-block scope from `string.unquoted.content-block.nmbl` to `text.content-block.nmbl` — a raw block's body is text in the output, so a string scope made it render in the theme's string color.
