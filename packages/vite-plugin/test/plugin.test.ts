import { describe, it, expect } from 'vitest';
import nmblPlugin from '../src/index.js';
import type { Plugin } from 'vite';

function getPlugin(name: string, options?: Parameters<typeof nmblPlugin>[0]): any {
  const plugins = nmblPlugin(options) as Plugin[];
  return plugins.find(p => p.name === name)!;
}

const ctx = {
  warnings: [] as string[],
  warn(msg: string) { this.warnings.push(msg); },
  error(msg: string) { throw new Error(msg); },
};

describe('nmbl:transform (.nmbl files)', () => {
  it('compiles .nmbl modules to an html string export', async () => {
    const p = getPlugin('nmbl:transform');
    const out = await p.transform.call(ctx, 'div#app\n  p hello', '/x/test.nmbl');
    expect(out.code).toContain('export default');
    expect(out.code).toContain('<div id=\\"app\\">');
  });

  it('ignores non-nmbl files', async () => {
    const p = getPlugin('nmbl:transform');
    expect(await p.transform.call(ctx, 'div', '/x/test.txt')).toBeUndefined();
  });

  it('renders :md content blocks as markdown by DEFAULT (no config)', async () => {
    const p = getPlugin('nmbl:transform');
    const out = await p.transform.call(ctx, 'div.prose:md\n  ### Hi\n\n  Some `{x}` and **bold**.', '/x/test.nmbl');
    expect(out.code).toContain('<h3>Hi</h3>');
    expect(out.code).toContain('<strong>bold</strong>');
    // braces inside code spans are escaped so host frameworks don't parse them
    expect(out.code).toContain('&#123;x&#125;');
  });

  it('a user-supplied md filter overrides the default', async () => {
    const p = getPlugin('nmbl:transform', { filters: { md: () => 'CUSTOM' } });
    const out = await p.transform.call(ctx, 'div:md\n  # ignored', '/x/test.nmbl');
    expect(out.code).toContain('CUSTOM');
    expect(out.code).not.toContain('<h1>');
  });

  it('renders :md content blocks through an async filter', async () => {
    const md = async (body: string) => `<h1>${body.replace('# ', '')}</h1>`;
    const p = getPlugin('nmbl:transform', { filters: { md } });
    const out = await p.transform.call(ctx, 'div.prose:md\n  # Hello', '/x/test.nmbl');
    // generated markup is indented into its parent (on its own lines)
    expect(out.code).toContain('<div class=\\"prose\\">\\n  <h1>Hello</h1>\\n</div>');
    expect(out.code).not.toContain('nmbl:filter');
  });

  it('resolves multiple :md blocks independently', async () => {
    const md = async (body: string) => `[${body}]`;
    const p = getPlugin('nmbl:transform', { filters: { md } });
    const out = await p.transform.call(ctx, 'div:md\n  one\nsection:md\n  two', '/x/test.nmbl');
    expect(out.code).toContain('[one]');
    expect(out.code).toContain('[two]');
    expect(out.code).not.toContain('nmbl:filter');
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
  it('skips sub-resource requests', async () => {
    const p = getPlugin('nmbl:astro-sfc');
    expect(await p.load.call(ctx, '/x/page.astro?astro&type=style')).toBeUndefined();
  });

  it('compiles the body template but leaves frontmatter strings untouched', async () => {
    // A docs page may hold a literal `<template lang="nmbl">` example inside a
    // frontmatter string — that's JS, not template markup, and must survive as-is.
    const page = `---
const example = \`<template lang="nmbl">
div#app
  p hello
</template>\`;
---

<template lang="nmbl">
section.docs
  pre {example}
</template>
`;
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const file = join(mkdtempSync(join(tmpdir(), 'nmbl-test-')), 'page.astro');
    writeFileSync(file, page);

    const p = getPlugin('nmbl:astro-sfc');
    const out = await p.load.call(ctx, file) as string;
    // body compiled…
    expect(out).toContain('<section class="docs">');
    // …frontmatter example intact, NOT compiled into html
    expect(out).toContain('<template lang="nmbl">\ndiv#app');
    expect(out).not.toContain('<div id="app">');
  });
});
