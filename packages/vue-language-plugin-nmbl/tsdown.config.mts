import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'cjs',
  clean: true,
  outDir: 'dist',
  // Bundle the NMBL parser and other dependencies directly
  external: [
    // Only externalize Vue-related packages that should come from the host
    '@vue/language-core',
    '@vue/compiler-dom',
    '@vue/compiler-core',
    '@vue/shared',
  ],
  platform: 'node',
  dts: true,
  sourcemap: false,
  inlineOnly: false
});