import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Tests live in the test/ directory
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    // Prefer .ts over .js so vitest imports TS source directly, not compiled output
    extensions: ['.ts', '.tsx', '.js', '.mjs', '.jsx'],
    alias: {
      // Stub the vscode module so unit tests can run outside VS Code
      vscode: resolve(__dirname, 'test/__mocks__/vscode.ts'),
      // Resolve @nmbl-lang/core to the built dist (avoids needing bun install symlink)
      '@nmbl-lang/core': resolve(__dirname, '../../packages/core/dist/index.mjs'),
    },
  },
});
