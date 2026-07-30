---
"@nmbl-lang/core": patch
---

Editor-grammar fixes carried by the generated artifacts (TextMate, Monarch, tree-sitter):

- `:md` blocks highlight as Markdown instead of raw code, with fuller Markdown coverage and per-language highlighting of fenced code inside them.
- Interpolation braces pair correctly — `{{ }}` reads as one bracket pair rather than nested, so the closing `}}` is no longer flagged as unmatched.
- A stray quote no longer poisons the highlighting of every following line.
- Blank lines round-trip through compile and decompile.
