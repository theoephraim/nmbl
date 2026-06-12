# @nmbl/prettier-plugin

[Prettier](https://prettier.io) plugin for [NMBL](https://nmbl.tools) — formats
`.nmbl` files to canonical form.

```sh
npm install -D prettier @nmbl/prettier-plugin
```

## Usage

Add the plugin to your Prettier config:

```jsonc
// .prettierrc
{
  "plugins": ["@nmbl/prettier-plugin"]
}
```

Then format as usual:

```sh
prettier --write "**/*.nmbl"
prettier --check "**/*.nmbl"
```

Prettier's `tabWidth` maps to NMBL's indentation and `printWidth` controls where
attribute lists wrap. Unparseable input is passed through unchanged — the plugin
never mangles a file it can't parse.

> This plugin handles standalone `.nmbl` files. To format NMBL embedded in
> `.vue` / `.svelte` / `.astro` / `.jsx` files, use the [`@nmbl/cli`](../cli)
> (`nmbl format`), which understands those host files.
