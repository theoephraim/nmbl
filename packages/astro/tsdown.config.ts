import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  // @nmbl-lang/vite-plugin is a real (peer-installed) dependency, not bundled.
});
