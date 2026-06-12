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
    '@nmbl/parser',
    '@volar/language-core',
    '@volar/language-server',
    '@volar/language-service',
    'volar-service-html',
    'vscode-html-languageservice',
    'vscode-uri',
  ],
});
