import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  // tsserver loads plugins via `require()`, so the entry must be CommonJS.
  format: 'cjs',
  clean: true,
  outDir: 'dist',
  // `typescript` is provided by the host (tsserver / the project's TS install).
  external: ['typescript', 'typescript/lib/tsserverlibrary'],
  platform: 'node',
  dts: true,
  sourcemap: false,
});
