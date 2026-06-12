import { readFileSync } from 'node:fs';
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
      const { html, errors } = await compileAsync(code, { framework: options.framework }, filters);
      if (errors.length > 0) {
        this.warn(`NMBL compilation errors in ${id}:\n${formatErrors(errors)}`);
      }
      return {
        code: `export default ${JSON.stringify(html)};`,
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

      const templateRegex = /<template[^>]*\blang=(["'])nmbl\1[^>]*>([\s\S]*?)<\/template>/g;
      let result = body;
      let match;

      while ((match = templateRegex.exec(body)) !== null) {
        const { html, errors } = await compileAsync(dedent(match[2]), { framework: 'astro' }, filters);
        if (errors.length > 0) {
          this.error(`NMBL compilation failed in ${id}:\n${formatErrors(errors)}`);
        }
        // Replace <template lang="nmbl">...</template> with just the compiled HTML
        // (no <template> wrapper — in Astro, <template> is a regular HTML element)
        result = result.replace(match[0], html);
      }

      return src.slice(0, bodyStart) + result;
    },
  };

  const plugins: Plugin[] = [vueSfcPreprocess, astroSfcPreprocess, nmblTransform];

  if (options.jsx !== undefined) {
    plugins.unshift(taggedTemplatePlugin(options.jsx));
  }

  return plugins;
}
