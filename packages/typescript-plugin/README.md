# @nmbl-lang/typescript-plugin

A TypeScript language-service plugin that teaches `tsserver` about
`` nmbl`…` `` tagged templates (the React / Solid / Qwik integration).

## The problem it solves

Inside a `` nmbl`…` `` template, a component is referenced by name:

```tsx
import { Badge } from './components/Badge';

export default function App() {
  return nmbl`
    div
      Badge(text="Hi")   // ← compiled to <Badge text="Hi" /> at build time
  `;
}
```

To TypeScript, the template body is just a string, so it can't see that
`Badge` is used — and reports **“'Badge' is declared but its value is never
read” (TS 6133)**. This plugin removes those false positives: it scans the
literal text of every `` nmbl`…` `` template, collects the identifiers used
there, and suppresses the matching unused-declaration diagnostics (both the
editor's grey "unused" hint and the `noUnusedLocals` error).

It only ever **removes** unused-declaration diagnostics, and only for names
that actually appear in an nmbl template — a genuinely unused import is still
reported. `${…}` substitutions are left alone (TS already sees those).

## Usage

Add it to your project's `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "plugins": [{ "name": "@nmbl-lang/typescript-plugin" }]
  }
}
```

In VS Code, run **“TypeScript: Select TypeScript Version” → “Use Workspace
Version”** so the editor's `tsserver` loads workspace plugins.

### Options

```jsonc
{ "name": "@nmbl-lang/typescript-plugin", "tagName": "nmbl" }
```

- `tagName` — the tagged-template tag to recognise. Defaults to `nmbl`.

## Scope / limitations

- This is an **editor / `tsserver`** plugin. Plain `tsc` on the command line
  does **not** load language-service plugins, so for CI type-checking you'd
  still need a wrapper (the same situation as `vue-tsc`).
- It currently fixes the unused-import diagnostic. Go-to-definition, rename,
  and prop type-checking inside templates are natural follow-ups built on the
  same template-scanning core.
