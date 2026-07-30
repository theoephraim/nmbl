---
"@nmbl-lang/typescript-plugin": minor
---

First real release. A tsserver language-service plugin that teaches TypeScript about `` nmbl`…` `` tagged templates: components referenced only as bare tags inside a template are no longer flagged "declared but never used". It only ever suppresses those false positives — genuinely unused imports are still reported.

Add it to `tsconfig.json` under `compilerOptions.plugins`. Note that this is a language-service plugin, so it applies in the editor; plain `tsc` does not load it.
