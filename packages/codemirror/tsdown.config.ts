import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  // Inline the generated Monarch JSON so consumers don't resolve core's
  // ./monarch subpath (it lives outside core's dist).
  noExternal: [/@nmbl-lang\/core\/monarch/],
});
