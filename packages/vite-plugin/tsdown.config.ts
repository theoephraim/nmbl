import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/tag.ts'],
  format: ['esm'],
  dts: true,
});
