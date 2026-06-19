import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: 'esm',
  dts: true,
  // Bundle @nmbl-lang/core so the published CLI is a self-contained executable
  // that works when installed globally, outside the workspace.
  noExternal: ['@nmbl-lang/core'],
});
