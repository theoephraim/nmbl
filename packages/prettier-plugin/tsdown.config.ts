import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  // Bundle @nmbl/parser so the output is self-contained.
  // Prettier loads plugins from its own module-resolution context and can't
  // resolve workspace dependencies, so the formatter must be inlined.
  noExternal: ['@nmbl/parser'],
});
