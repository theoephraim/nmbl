# NMBL prompts example

NMBL used as a structure-first format for **AI prompts** — light XML-ish tags and
attributes wrapped around large markdown sections — instead of as an HTML
template. One `.nmbl` source is consumed two ways:

- **As a structured object** — `parseStructured()` returns `{ frontmatter, tree }`,
  so a tool can read frontmatter as metadata and walk each document as data.
- **As a rendered string** — `compile(src, { framework: 'prompt' })` emits an
  XML-ish string with the markdown sections kept as text (re-indented to nest
  under their tags), ready to drop into a model call.

## Run

```sh
bun install
bun run start
```

## Files

- [`prompts/`](./prompts) — a folder of prompt documents (`summarize`, `code-review`,
  `extract`). Each has YAML frontmatter (title, model, tags) and a body of tags +
  `:md` sections.
- [`load.ts`](./load.ts) — loads the folder, prints a registry from the frontmatter,
  dumps one prompt's structured tree, and renders one to the prompt string.

`parseStructured` takes a plain string, so it has no opinion about *where* the
source comes from — this example reads a folder, but the same call works on a
database row, an HTTP response, or a CMS field. There is no "load folder" API;
that loop is just caller glue (which is why core stays I/O-free and browser-safe).

The `:md` sections keep markdown highlighting while you author, but stay raw text
in both outputs — author with `:md`, render with `framework: 'prompt'`.
