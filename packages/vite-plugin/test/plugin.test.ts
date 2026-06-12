import { describe, it, expect } from 'vitest';
import nmblPlugin from '../src/index.js';
import type { Plugin } from 'vite';

function getPlugin(name: string): any {
  const plugins = nmblPlugin() as Plugin[];
  return plugins.find(p => p.name === name)!;
}

const ctx = {
  warnings: [] as string[],
  warn(msg: string) { this.warnings.push(msg); },
  error(msg: string) { throw new Error(msg); },
};

describe('nmbl:transform (.nmbl files)', () => {
  it('compiles .nmbl modules to an html string export', () => {
    const p = getPlugin('nmbl:transform');
    const out = p.transform.call(ctx, 'div#app\n  p hello', '/x/test.nmbl');
    expect(out.code).toContain('export default');
    expect(out.code).toContain('<div id=\\"app\\">');
  });

  it('ignores non-nmbl files', () => {
    const p = getPlugin('nmbl:transform');
    expect(p.transform.call(ctx, 'div', '/x/test.txt')).toBeUndefined();
  });
});

describe('nmbl:vue-sfc', () => {
  const sfc = `<script setup lang="ts">
const msg = 'hi';
</script>

<template lang="nmbl">
div#app
  p.lead {{ msg }}
  button(@click="go" :disabled) Go
</template>

<style scoped>
.lead { color: red; }
</style>
`;

  it('compiles the nmbl template block and strips the lang attr', async () => {
    const p = getPlugin('nmbl:vue-sfc');
    const out = await p.transform.call(ctx, sfc, '/x/App.vue');
    expect(out.code).toContain('<template>');
    expect(out.code).not.toContain('lang="nmbl"');
    expect(out.code).toContain('<p class="lead">{{ msg }}</p>');
    expect(out.code).toContain('@click="go"');
    // script/style blocks untouched
    expect(out.code).toContain(`const msg = 'hi';`);
    expect(out.code).toContain('.lead { color: red; }');
    expect(out.map).toBeTruthy();
  });

  it('dedents indented template bodies', async () => {
    const indented = `<template lang="nmbl">
  div#app
    p hi
</template>`;
    const p = getPlugin('nmbl:vue-sfc');
    const out = await p.transform.call(ctx, indented, '/x/App.vue');
    expect(out.code).toContain('<div id="app">');
    expect(out.code).toContain('<p>hi</p>');
  });

  it('supports single-quoted lang attribute', async () => {
    const single = `<template lang='nmbl'>
div\n  p hi
</template>`;
    const p = getPlugin('nmbl:vue-sfc');
    const out = await p.transform.call(ctx, single, '/x/App.vue');
    expect(out.code).toContain('<p>hi</p>');
  });

  it('compiles @if block in vue template to <template v-if=', async () => {
    const sfc = `<template lang="nmbl">
@if(x)
  p hi
@else
  p bye
</template>`;
    const p = getPlugin('nmbl:vue-sfc');
    const out = await p.transform.call(ctx, sfc, '/x/App.vue');
    expect(out.code).toContain('<template v-if="x">');
    expect(out.code).toContain('<template v-else>');
    expect(out.code).toContain('<p>hi</p>');
    expect(out.code).not.toContain('lang="nmbl"');
  });

  it('compiles @each with :key in vue template to <template v-for> with :key attr', async () => {
    const sfc = `<template lang="nmbl">
@each(item in items :key="item.id")
  li {{ item.name }}
</template>`;
    const p = getPlugin('nmbl:vue-sfc');
    const out = await p.transform.call(ctx, sfc, '/x/App.vue');
    expect(out.code).toContain('<template v-for="item of items" :key="item.id">');
    expect(out.code).toContain('<li>{{ item.name }}</li>');
    expect(out.code).not.toContain('lang="nmbl"');
  });

  it('leaves plain-html templates alone', async () => {
    const plain = `<template>\n  <div/>\n</template>`;
    const p = getPlugin('nmbl:vue-sfc');
    expect(await p.transform.call(ctx, plain, '/x/App.vue')).toBeUndefined();
  });
});

describe('nmbl:astro-sfc', () => {
  it('skips sub-resource requests', () => {
    const p = getPlugin('nmbl:astro-sfc');
    expect(p.load.call(ctx, '/x/page.astro?astro&type=style')).toBeUndefined();
  });
});
