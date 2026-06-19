import { describe, test, expect } from 'vitest';
import { extractNmblRegions, formatFile } from '../src/index.js';

describe('extractNmblRegions', () => {
  test('whole .nmbl file', () => {
    const { framework, regions } = extractNmblRegions('div\n  p hi', 'x.nmbl');
    expect(framework).toBe('html');
    expect(regions).toHaveLength(1);
    expect(regions[0].kind).toBe('whole-file');
    expect(regions[0].content).toBe('div\n  p hi');
  });

  test('vue SFC template block', () => {
    const src = `<script setup></script>\n\n<template lang="nmbl">\n  #app\n    h1 hi\n</template>\n`;
    const { framework, regions } = extractNmblRegions(src, 'App.vue');
    expect(framework).toBe('vue');
    expect(regions).toHaveLength(1);
    expect(regions[0].content).toContain('#app');
    expect(src.slice(regions[0].start, regions[0].end)).toBe(regions[0].content);
  });

  test('ignores template without lang=nmbl', () => {
    const src = `<template>\n  <div>hi</div>\n</template>`;
    expect(extractNmblRegions(src, 'App.vue').regions).toHaveLength(0);
  });

  test('multiple svelte blocks', () => {
    const src = `<template lang="nmbl">\n  p a\n</template>\n<template lang='nmbl'>\n  p b\n</template>`;
    expect(extractNmblRegions(src, 'X.svelte').regions).toHaveLength(2);
  });

  test('static jsx tagged template', () => {
    const src = 'const x = nmbl`div\n  p hi`;';
    const { regions } = extractNmblRegions(src, 'C.tsx');
    expect(regions).toHaveLength(1);
    expect(regions[0].kind).toBe('tagged-template');
    expect(regions[0].skipReason).toBeUndefined();
  });

  test('jsx template with holes is flagged skip', () => {
    const src = 'const x = nmbl`div ${name}`;';
    const { regions } = extractNmblRegions(src, 'C.tsx');
    expect(regions[0].skipReason).toBeTruthy();
  });

  test('ignores nmbl in strings and comments', () => {
    const src = '// nmbl`fake`\nconst s = "nmbl`also fake`";\nconst real = nmbl`p hi`;';
    const { regions } = extractNmblRegions(src, 'C.tsx');
    expect(regions).toHaveLength(1);
    expect(regions[0].content).toBe('p hi');
  });
});

describe('formatFile', () => {
  test('formats whole .nmbl file', () => {
    const r = formatFile('div\n        span    hi', 'x.nmbl');
    expect(r.code).toBe('div\n  span hi\n');
    expect(r.changed).toBe(true);
  });

  test('formats vue template block, preserving surrounding code', () => {
    const src = `<script setup>\nconst x = 1;\n</script>\n\n<template lang="nmbl">\n      #app
            h1    Title
</template>\n`;
    const r = formatFile(src, 'App.vue');
    expect(r.code).toContain('<script setup>\nconst x = 1;\n</script>');
    expect(r.code).toContain('<template lang="nmbl">\n  #app\n    h1 Title\n</template>');
    expect(r.changed).toBe(true);
  });

  test('idempotent on vue block', () => {
    const src = `<template lang="nmbl">\n  #app\n    h1 Title\n</template>\n`;
    const once = formatFile(src, 'App.vue').code;
    const twice = formatFile(once, 'App.vue').code;
    expect(twice).toBe(once);
  });

  test('nested template block reindents under its own indent', () => {
    const src = `  <template lang="nmbl">\n  p hi\n  </template>`;
    const r = formatFile(src, 'X.svelte');
    expect(r.code).toBe(`  <template lang="nmbl">\n    p hi\n  </template>`);
  });

  test('skips jsx template with holes untouched', () => {
    const src = 'const x = nmbl`div ${name}`;';
    const r = formatFile(src, 'C.tsx');
    expect(r.code).toBe(src);
    expect(r.skipped).toHaveLength(1);
  });

  test('formats static jsx template', () => {
    const src = 'const x = nmbl`div\n    p   hi`;';
    const r = formatFile(src, 'C.tsx');
    expect(r.code).toBe('const x = nmbl`\n  div\n    p hi\n`;');
  });

  test('svelte file gets native @each as-form', () => {
    const src = `<template lang="nmbl">\n  @each(item of items :key="item.id")\n    li hi\n</template>`;
    const r = formatFile(src, 'List.svelte');
    expect(r.code).toContain('@each(items as item (item.id))');
  });

  test('vue file keeps portable @each of-form', () => {
    const src = `<template lang="nmbl">\n  @each(items as item :key="item.id")\n    li hi\n</template>`;
    const r = formatFile(src, 'List.vue');
    expect(r.code).toContain('@each(item of items :key="item.id")');
  });

  test('whole .nmbl file uses portable of-form (target unknown)', () => {
    const r = formatFile('@each(items as item (item.id))\n  li hi', 'x.nmbl');
    expect(r.code).toContain('@each(item of items :key="item.id")');
  });

  test('leaves unparseable region untouched', () => {
    const src = `<template lang="nmbl">\n  div(foo="bar\n</template>`;
    const r = formatFile(src, 'App.vue');
    expect(r.code).toBe(src);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
