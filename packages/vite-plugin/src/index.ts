import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { compile } from '@nmbl-lang/core';
import { mdFilter } from '@nmbl-lang/core/markdown';
import type { NmblError } from '@nmbl-lang/core';
import type { Plugin } from 'vite';
import MagicString from 'magic-string';
import { taggedTemplatePlugin } from './tagged-template.js';
import type { JsxOptions } from './tagged-template.js';

export interface NmblPluginOptions {
  /**
   * Framework target for standalone `.nmbl` files. (Vue SFC templates always
   * compile with 'vue'; `.astro` files with 'astro'.)
   */
  framework?: 'html' | 'vue' | 'svelte' | 'astro';

  /**
   * Enable the nmbl`` tagged template literal transform for JSX frameworks.
   * When set, the plugin will compile nmbl`…` expressions in .jsx/.tsx/.js/.ts
   * files to JSX at build time (zero runtime).
   *
   * - `framework: 'react'` (default) — applies { class → className, for → htmlFor }
   * - `framework: 'solid' | 'qwik' | 'preact'` — no attribute aliases (class preserved)
   */
  jsx?: JsxOptions;

  /**
   * Content-block filters: `div.prose:md` hands its raw body to `filters.md`
   * and splices the result into the output. Unlike core's sync `filters`,
   * these may be async (e.g. a remark-based markdown renderer).
   *
   * An `md` filter (CommonMark + GFM via `@nmbl-lang/core/markdown`) is
   * provided by default; supply your own `md` to override it.
   */
  filters?: Record<string, (body: string) => string | Promise<string>>;
}

function formatErrors(errors: NmblError[]): string {
  return errors.map(e => `${e.message} (${e.span.start.line + 1}:${e.span.start.column + 1})`).join('\n');
}

type AsyncFilters = NonNullable<NmblPluginOptions['filters']>;

/**
 * compile() with possibly-async filters. Core's compile is synchronous, so each
 * filter emits a unique placeholder during the compile pass and the rendered
 * bodies are awaited and spliced in afterwards. Zero overhead when no filter fires.
 */
async function compileAsync(
  src: string,
  options: Parameters<typeof compile>[1],
  filters: AsyncFilters | undefined,
): Promise<ReturnType<typeof compile>> {
  const pending: Promise<[placeholder: string, rendered: string]>[] = [];
  let n = 0;
  const syncFilters: Record<string, (body: string) => string> = {};
  for (const [name, fn] of Object.entries(filters ?? {})) {
    syncFilters[name] = (body) => {
      const placeholder = `\u0000nmbl:filter:${n++}\u0000`;
      pending.push(Promise.resolve(fn(body)).then(rendered => [placeholder, rendered]));
      return placeholder;
    };
  }
  const result = compile(src, { ...options, filters: syncFilters });
  if (pending.length > 0) {
    let html = result.html;
    for (const [placeholder, rendered] of await Promise.all(pending)) {
      html = html.replace(placeholder, () => rendered);
    }
    return { ...result, html };
  }
  return result;
}

/**
 * Split leading YAML frontmatter (`---\n…\n---`) off a `.nmbl` source, mirroring
 * markdown/MDX so `.nmbl` files can carry page metadata. Returns the raw YAML
 * text (or null when absent) and the template body. The frontmatter region is
 * replaced with blank lines rather than removed, so compile diagnostics keep
 * reporting the body's original line numbers.
 */
function splitFrontmatter(src: string): { yaml: string | null; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return { yaml: null, body: src };
  const blanks = m[0].replace(/[^\n]/g, '');
  return { yaml: m[1], body: blanks + src.slice(m[0].length) };
}

/** Strip the common leading indentation from an SFC template body. */
function dedent(src: string): string {
  const lines = src.split('\n');
  let min = Infinity;
  for (const l of lines) {
    if (!l.trim()) continue;
    const indent = l.match(/^[ \t]*/)![0].length;
    if (indent < min) min = indent;
  }
  if (!isFinite(min) || min === 0) return src;
  return lines.map(l => (l.trim() ? l.slice(min) : l)).join('\n');
}

export default function nmblPlugin(options: NmblPluginOptions = {}): Plugin[] {
  const filters: AsyncFilters = { md: mdFilter, ...options.filters };

  const nmblTransform: Plugin = {
    name: 'nmbl:transform',

    async transform(code, id) {
      if (!id.endsWith('.nmbl')) return;
      const { yaml, body } = splitFrontmatter(code);
      let frontmatter: Record<string, unknown> = {};
      if (yaml !== null) {
        try {
          frontmatter = (parseYaml(yaml) as Record<string, unknown>) ?? {};
        } catch (e) {
          this.error(`NMBL frontmatter is not valid YAML in ${id}: ${(e as Error).message}`);
        }
      }
      const { html, errors } = await compileAsync(body, { framework: options.framework }, filters);
      if (errors.length > 0) {
        this.warn(`NMBL compilation errors in ${id}:\n${formatErrors(errors)}`);
      }
      return {
        code:
          `export default ${JSON.stringify(html)};\n` +
          `export const frontmatter = ${JSON.stringify(frontmatter)};`,
        map: null,
      };
    },
  };

  const vueSfcPreprocess: Plugin = {
    name: 'nmbl:vue-sfc',
    enforce: 'pre',

    async transform(src, id) {
      if (!id.split('?')[0].endsWith('.vue')) return;
      if (!src.includes('nmbl')) return;

      // Locate the template block with the SFC parser (handles quote styles,
      // extra attributes, and gives exact offsets). `vue/compiler-sfc` ships
      // inside the `vue` package, which is guaranteed present for .vue files.
      const { parse } = await import('vue/compiler-sfc');
      const { descriptor } = parse(src, { filename: id, sourceMap: false });
      const tpl = descriptor.template;
      if (!tpl || tpl.lang !== 'nmbl') return;

      const { html, errors } = await compileAsync(dedent(tpl.content), { framework: 'vue' }, filters);
      if (errors.length > 0) {
        this.error(`NMBL compilation failed in ${id}:\n${formatErrors(errors)}`);
      }

      // Splice the compiled HTML into the SFC, swapping lang="nmbl" out of the
      // opening tag so @vitejs/plugin-vue parses it as a plain template.
      const s = new MagicString(src);
      const openTag = src.slice(0, tpl.loc.start.offset);
      const openTagStart = openTag.lastIndexOf('<template');
      const openTagSrc = src.slice(openTagStart, tpl.loc.start.offset);
      s.update(openTagStart, tpl.loc.start.offset, openTagSrc.replace(/\s+lang=(["'])nmbl\1/, ''));
      s.update(tpl.loc.start.offset, tpl.loc.end.offset, `\n${html}\n`);

      return {
        code: s.toString(),
        map: s.generateMap({ hires: 'boundary', source: id }),
      };
    },
  };

  // Astro's own Vite plugin uses enforce:'pre' and runs its transform before
  // integration plugins. We use a `load` hook to intercept the file content
  // before any transform hooks run, compile NMBL to HTML, and return the
  // result so Astro's compiler sees standard HTML.
  const astroSfcPreprocess: Plugin = {
    name: 'nmbl:astro-sfc',
    enforce: 'pre',

    async load(id) {
      // Skip sub-resource requests (e.g. ?astro&type=style)
      if (id.includes('?')) return;
      if (!id.endsWith('.astro')) return;

      let src: string;
      try {
        src = readFileSync(id, 'utf-8');
      } catch {
        return;
      }

      if (!src.includes('lang="nmbl"') && !src.includes("lang='nmbl'")) return;

      // Astro frontmatter is JS — a string literal in it may legitimately contain
      // `<template lang="nmbl">` (e.g. a docs page showing example code). Only the
      // component body is template markup, so match against the body alone.
      const fm = /^---\r?\n[\s\S]*?\r?\n---/.exec(src);
      const bodyStart = fm ? fm[0].length : 0;
      const body = src.slice(bodyStart);

      // Match the body's nmbl template block with a GREEDY content capture: the
      // first `<template lang="nmbl">` opening through the LAST `</template>`. A
      // literal `</template>` *inside* the template — a Vue SFC shown in a `:md`
      // code block, or the tag named in prose — therefore can't prematurely close
      // the block. (An Astro page carries a single nmbl template block.)
      const templateRegex = /<template[^>]*\blang=(["'])nmbl\1[^>]*>([\s\S]*)<\/template>/;
      const match = templateRegex.exec(body);
      if (!match) return;

      const { html, errors } = await compileAsync(dedent(match[2]), { framework: 'astro' }, filters);
      if (errors.length > 0) {
        this.error(`NMBL compilation failed in ${id}:\n${formatErrors(errors)}`);
      }

      // Splice the compiled HTML in by index (not String.replace, whose `$`
      // sequences would be interpreted). The <template> wrapper is dropped — in
      // Astro, <template> is a regular HTML element, not a slot for markup.
      const result =
        body.slice(0, match.index) + html + body.slice(match.index + match[0].length);

      return src.slice(0, bodyStart) + result;
    },
  };

  const plugins: Plugin[] = [vueSfcPreprocess, astroSfcPreprocess, nmblTransform];

  if (options.jsx !== undefined) {
    plugins.unshift(taggedTemplatePlugin(options.jsx));
  }

  return plugins;
}
