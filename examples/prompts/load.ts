/**
 * "Prompts mode": load a folder of `.nmbl` files and use each one two ways —
 * as a structured object (frontmatter + tree) and as a rendered XML-ish string.
 *
 * Run with: `bun run start` (from this folder) or `bun run load.ts`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '@nmbl-lang/core';
import { parseStructured, type NmblDocument } from '@nmbl-lang/core/structured';

const promptsDir = join(dirname(fileURLToPath(import.meta.url)), 'prompts');

/**
 * Reading a folder is just one way to feed parseStructured — it takes a plain
 * string, so the source could equally be a database row, an HTTP response, or a
 * CMS field. parseStructured is the primitive; this readdir loop is caller glue,
 * which is why core stays I/O-free (and browser-safe).
 */
function loadPrompts(dir: string): Record<string, NmblDocument> {
  const entries = readdirSync(dir).filter((f) => f.endsWith('.nmbl'));
  return Object.fromEntries(
    entries.map((file) => {
      const source = readFileSync(join(dir, file), 'utf8');
      return [file.replace(/\.nmbl$/, ''), parseStructured(source)];
    }),
  );
}

const prompts = loadPrompts(promptsDir);

// 1. A registry view — read the frontmatter of each file as metadata.
console.log('═══ Prompt library (from frontmatter) ═══\n');
for (const [name, { frontmatter }] of Object.entries(prompts)) {
  const tags = (frontmatter.tags as string[] | undefined)?.join(', ') ?? '';
  console.log(`• ${name.padEnd(12)} ${frontmatter.title}  [${tags}]`);
}

// 2. Structured object — walk one prompt as data.
const summarize = prompts['summarize'];
console.log('\n═══ Structured tree: summarize ═══\n');
console.dir(summarize.tree, { depth: null });

// 3. Rendered string — the SAME file compiled to an XML-ish prompt via the
//    'prompt' target (markdown sections kept as text, re-indented). `body` is
//    the frontmatter-stripped template returned by parseStructured.
console.log('\n═══ Rendered prompt string: summarize ═══\n');
console.log(compile(summarize.body, { framework: 'prompt' }).html);
