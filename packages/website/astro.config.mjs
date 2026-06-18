import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import nmbl from '@nmbl-lang/astro';
import expressiveCode from 'astro-expressive-code';

// Expressive Code options (themes, NMBL grammars/injections, the rainbow
// indent-guide plugin) live in ./ec.config.mjs — required so the `<Code>`
// component can load them from a standalone file. `expressiveCode()` picks it
// up automatically.

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
    plugins: [
      // Dev only: browsers were serving stale CSS on a plain refresh (the HTML
      // doc shipped with no cache headers, and Vite serves the scoped-style
      // module as `no-cache`, which the browser still cached). HMR masked it by
      // patching the live DOM, so edits only "reverted" on reload. Force
      // `no-store` on every dev response — and stop Vite from overriding it back
      // to `no-cache` when it serves modules — so a refresh always refetches.
      {
        name: 'website:dev-no-store',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use((_req, res, next) => {
            const setHeader = res.setHeader.bind(res);
            res.setHeader = (name, value) =>
              String(name).toLowerCase() === 'cache-control'
                ? res
                : setHeader(name, value);
            setHeader('Cache-Control', 'no-store');
            next();
          });
        },
      },
    ],
  },
  integrations: [
    expressiveCode(),
    vue(),
    nmbl(),
  ],
});
