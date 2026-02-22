import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  // Bundle @nmbl/parser so the output is self-contained.
  // This is needed because the Svelte language server loads the preprocessor
  // from its own Node process and can't resolve workspace dependencies.
  noExternal: ['@nmbl/parser'],
});
