# @nmbl-lang/cli

Command-line formatter and linter for [NMBL](https://nmbl.tools).

```sh
npm install -D @nmbl-lang/cli
```

## Usage

```sh
nmbl format <paths…> [options]   # format .nmbl files and embedded NMBL regions
nmbl lint   <paths…> [options]   # report best-practice & correctness diagnostics
```

Paths may be files or directories. Directories are searched for `.nmbl`, `.vue`,
`.svelte`, `.astro`, `.jsx`, and `.tsx` files (`node_modules` and build output are
skipped). Embedded NMBL is found inside `<template lang="nmbl">` blocks and
`` nmbl`…` `` tagged templates.

### `nmbl format`

| Option | Description |
|---|---|
| `-w`, `--write` | Rewrite files in place |
| `--check` | Exit non-zero if any file is not already formatted (for CI) |
| `--indent <n>` | Indentation width in spaces (default `2`) |
| `--print-width <n>` | Column at which attribute lists wrap (default `100`) |

With neither `--write` nor `--check`, the formatted result is printed to stdout.

The formatter **never rewrites a file it can't fully parse** — unparseable input
is passed through untouched, so it's safe to run on format-on-save or in a hook.

### `nmbl lint`

| Option | Description |
|---|---|
| `--quiet` | Only report errors, not warnings |
| `--max-warnings <n>` | Exit non-zero if warnings exceed this count |

Exits non-zero when any error-severity diagnostic is found.

## Examples

```sh
# CI: fail the build if anything is unformatted
nmbl format src --check

# pre-commit / lint-staged
nmbl format --write

# diagnostics, errors only
nmbl lint src --quiet
```

### lint-staged

```jsonc
// package.json
{
  "lint-staged": {
    "*.{nmbl,vue,svelte,astro}": "nmbl format --write"
  }
}
```

## Programmatic API

```ts
import { formatContent, lintContent, collectFiles } from '@nmbl-lang/cli';

const { output, changed } = formatContent('App.vue', source);
const { messages } = lintContent('page.nmbl', source);
```

Prefer Prettier? See [`@nmbl-lang/prettier-plugin`](../prettier-plugin).
