import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // monogram ships raw .ts sources (no build); Node refuses to type-strip
    // node_modules, so vitest must transform it instead of externalizing.
    server: {
      deps: {
        inline: ['monogram'],
      },
    },
  },
});
