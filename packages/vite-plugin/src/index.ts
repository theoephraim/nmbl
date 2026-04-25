import { readFileSync } from 'node:fs';
import { compile } from '@nmbl/parser';
import type { NmblError } from '@nmbl/parser';
import type { Plugin } from 'vite';

export interface NmblPluginOptions {
  /** Framework target passed to the NMBL compiler */
  framework?: 'svelte' | 'astro';
}

function formatErrors(errors: NmblError[]): string {
  return errors.map(e => e.message).join('\n');
}

export default function nmblPlugin(_options: NmblPluginOptions = {}): Plugin[] {
  const nmblTransform: Plugin = {
    name: 'nmbl:transform',

    transform(code, id) {
      if (id.endsWith('.nmbl')) {
        const { html, errors } = compile(code, { framework: _options.framework });
        if (errors.length > 0) {
          this.warn(`NMBL compilation warnings in ${id}:\n${formatErrors(errors)}`);
        }
        return {
          code: `export default ${JSON.stringify(html)};`,
          map: null,
        };
      }
    },
  };

  const vueSfcPreprocess: Plugin = {
    name: 'nmbl:vue-sfc',
    enforce: 'pre',

    transform(src, id) {
      if (!id.endsWith('.vue')) return;
      if (!src.includes('lang="nmbl"')) return;

      // Use a regex-based approach to find and replace the template block.
      // This avoids a hard dependency on @vue/compiler-sfc.
      const templateRegex = /<template\s+lang="nmbl"\s*>([\s\S]*?)<\/template>/;
      const match = src.match(templateRegex);
      if (!match) return;

      const nmblSource = match[1];
      const { html, errors } = compile(nmblSource, { framework: _options.framework });
      if (errors.length > 0) {
        this.warn(`NMBL compilation warnings in ${id}:\n${formatErrors(errors)}`);
      }

      const result = src.replace(templateRegex, `<template>${html}</template>`);
      return {
        code: result,
        map: null,
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

    load(id) {
      // Skip sub-resource requests (e.g. ?astro&type=style)
      if (id.includes('?')) return;
      if (!id.endsWith('.astro')) return;

      let src: string;
      try {
        src = readFileSync(id, 'utf-8');
      } catch {
        return;
      }

      if (!src.includes('lang="nmbl"')) return;

      const templateRegex = /<template\s+lang="nmbl"\s*>([\s\S]*?)<\/template>/g;
      let result = src;
      let match;

      while ((match = templateRegex.exec(src)) !== null) {
        const nmblSource = match[1];
        const { html, errors } = compile(nmblSource, { framework: 'astro' });
        if (errors.length > 0) {
          this.warn(`NMBL compilation warnings in ${id}:\n${formatErrors(errors)}`);
        }
        // Replace <template lang="nmbl">...</template> with just the compiled HTML
        // (no <template> wrapper — in Astro, <template> is a regular HTML element)
        result = result.replace(match[0], html);
      }

      return result;
    },
  };

  return [vueSfcPreprocess, astroSfcPreprocess, nmblTransform];
}
