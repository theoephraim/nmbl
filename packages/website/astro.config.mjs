import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import nmbl from '@nmbl-lang/astro';
import expressiveCode from 'astro-expressive-code';
import nmblGrammar from '@nmbl-lang/vscode-extension/syntaxes/nmbl.tmLanguage.json' with { type: 'json' };

export default defineConfig({
  site: 'https://nmbl.tools',
  output: 'static',
  server: { port: 4344 },
  vite: {
    // @nmbl-lang/codemirror is a linked workspace package, so vite doesn't
    // prebundle it — its @codemirror/* imports must resolve to the SAME
    // instances as the app's prebundled copies (CodeMirror extensions are
    // instanceof-checked; two @codemirror/state instances break the editor).
    resolve: { dedupe: ['@codemirror/state', '@codemirror/view', '@codemirror/language'] },
    optimizeDeps: { include: ['@codemirror/state', '@codemirror/view', '@codemirror/language', 'codemirror', '@codemirror/lang-html'] },
  },
  integrations: [
    expressiveCode({
      themes: ['github-dark'],
      shiki: {
        langs: [{ ...nmblGrammar, name: 'nmbl' }],
      },
    }),
    vue(),
    nmbl(),
  ],
});
