import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Tests live in the test/ directory
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    // Prefer .ts over .js so vitest imports TS source directly, not compiled output
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      // Stub the vscode module so unit tests can run outside VS Code
      vscode: resolve(__dirname, 'test/__mocks__/vscode.ts'),
    },
  },
});
