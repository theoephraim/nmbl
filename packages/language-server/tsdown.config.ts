import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  clean: true,
  outDir: 'dist',
  dts: true,
  sourcemap: false,
  // Bundle all deps into the server so it can be spawned standalone via node.
  // Only leave node builtins external (handled automatically).
  external: [],
  noExternal: [
    '@nmbl-lang/core',
    '@volar/language-core',
    '@volar/language-server',
    '@volar/language-service',
    'volar-service-html',
    'vscode-html-languageservice',
    'vscode-uri',
  ],
  // Force the ESM build of vscode-html-languageservice. Its default (`main`)
  // entry is a UMD wrapper that does relative `require("./parser/htmlScanner")`
  // at runtime — rolldown can't follow those, so the bundle ships broken and the
  // server crashes on startup with "Cannot find module './parser/htmlScanner'".
  // The ESM build (`module` field) uses real imports that bundle correctly.
  alias: {
    'vscode-html-languageservice': 'vscode-html-languageservice/lib/esm/htmlLanguageService.js',
  },
});
