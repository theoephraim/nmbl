import { compile, type CompilerOptions } from '@nmbl/parser';

function dedent(text: string): string {
  // Strip leading/trailing blank lines
  const lines = text.replace(/^\n+/, '').replace(/\s+$/, '').split('\n');
  const minIndent = lines
    .filter(l => l.trim().length > 0)
    .reduce((min, l) => {
      const indent = l.match(/^(\s*)/)?.[1].length ?? 0;
      return Math.min(min, indent);
    }, Infinity);
  if (!isFinite(minIndent) || minIndent === 0) return lines.join('\n');
  return lines.map(l => l.slice(minIndent)).join('\n');
}

export interface NmblPreprocessOptions {
  /** Options passed to the NMBL compiler */
  compiler?: Omit<CompilerOptions, 'framework'>;
}

/**
 * Svelte preprocessor that compiles `<template lang="nmbl">` blocks.
 */
export function nmblPreprocess(options: NmblPreprocessOptions = {}) {
  return {
    name: 'nmbl',
    markup({ content, filename }: { content: string; filename?: string }) {
      // Support both <template lang="nmbl"> and <!-- nmbl --> syntaxes
      const templateRegex = /<template\s+lang="nmbl"\s*>([\s\S]*?)<\/template>/;
      const commentRegex = /<!--\s*nmbl\s*\n([\s\S]*?)-->/;

      let match = content.match(templateRegex);
      let isCommentSyntax = false;

      if (!match) {
        match = content.match(commentRegex);
        isCommentSyntax = true;
        if (!match) return;
      }

      const nmblSource = dedent(match[1]);
      const { html, errors } = compile(nmblSource, {
        ...options.compiler,
        framework: 'svelte',
        filename,
      });

      if (errors.length > 0) {
        console.warn(`[nmbl] Warnings in ${filename ?? 'unknown'}:`);
        for (const e of errors) {
          console.warn(`  ${e.message}`);
        }
      }

      const code = isCommentSyntax
        ? content.replace(commentRegex, html)
        : content.replace(templateRegex, html);
      return { code };
    },
  };
}
