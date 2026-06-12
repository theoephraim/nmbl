import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import nmbl from '@nmbl-lang/astro';
import expressiveCode from 'astro-expressive-code';
import nmblGrammar from '@nmbl-lang/vscode-extension/syntaxes/nmbl.tmLanguage.json' with { type: 'json' };

export default defineConfig({
  site: 'https://nmbl.tools',
  output: 'static',
  server: { port: 4344 },
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
