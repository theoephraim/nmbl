import { compile } from '@nmbl/parser';
import type { NmblError } from '@nmbl/parser';
import type { Plugin } from 'vite';

export interface NmblPluginOptions {
  // Reserved for future options
}

function formatErrors(errors: NmblError[]): string {
  return errors.map(e => e.message).join('\n');
}

export default function nmblPlugin(_options: NmblPluginOptions = {}): Plugin[] {
  const nmblTransform: Plugin = {
    name: 'nmbl:transform',

    transform(code, id) {
      if (id.endsWith('.nmbl')) {
        const { html, errors } = compile(code);
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
      const { html, errors } = compile(nmblSource);
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

  return [vueSfcPreprocess, nmblTransform];
}
