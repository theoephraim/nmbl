import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/markdown.ts'],
  format: ['esm'],
  // resolve monogram's types into our .d.ts (it ships raw .ts, no typings dist)
  dts: { resolve: ['monogram'] },
  // monogram is unpublished (github dep, raw .ts sources) — bundle it into
  // our dist so consumers never need to resolve it.
  noExternal: ['monogram'],
});
