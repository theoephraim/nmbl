import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectFiles, formatContent, lintContent } from '../src/core.js';

describe('formatContent', () => {
  test('formats a whole .nmbl file', () => {
    const r = formatContent('x.nmbl', 'div\n        span   hi');
    expect(r.output).toBe('div\n  span hi\n');
    expect(r.changed).toBe(true);
    expect(r.errors).toEqual([]);
  });

  test('reports parse errors without changing content', () => {
    const r = formatContent('x.nmbl', 'div(foo="bar');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.changed).toBe(false);
  });

  test('honors indent option', () => {
    const r = formatContent('x.nmbl', 'div\n  span hi', { indent: 4 });
    expect(r.output).toBe('div\n    span hi\n');
  });

  test('formats embedded vue template, leaving surrounding code intact', () => {
    const src = `<script setup></script>\n<template lang="nmbl">\n  div\n      span hi\n</template>\n`;
    const r = formatContent('App.vue', src);
    expect(r.output).toContain('<template lang="nmbl">\n  div\n    span hi\n</template>');
    expect(r.output).toContain('<script setup></script>');
  });

  test('reports skipped jsx regions with holes', () => {
    const r = formatContent('C.tsx', 'const x = nmbl`div ${y}`;');
    expect(r.skipped.length).toBe(1);
    expect(r.changed).toBe(false);
  });
});

describe('lintContent', () => {
  test('maps line numbers for whole .nmbl file', () => {
    const r = lintContent('x.nmbl', 'div\ndiv(a="1" a="2")');
    const dup = r.messages.find((m) => m.ruleId === 'no-duplicate-attributes');
    expect(dup).toBeTruthy();
    expect(dup!.line).toBe(2);
  });

  test('maps line numbers into a vue template block', () => {
    // <template> is host line 2 (1-based); the offending element is two lines
    // into the block.
    const src = `<script></script>\n<template lang="nmbl">\n  div\n  span.z.z\n</template>`;
    const r = lintContent('App.vue', src);
    const dup = r.messages.find((m) => m.ruleId === 'no-duplicate-classes');
    expect(dup).toBeTruthy();
    expect(dup!.line).toBe(4);
  });

  test('clean file → no messages', () => {
    expect(lintContent('x.nmbl', '.card\n  p hi').messages).toEqual([]);
  });
});

describe('collectFiles', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'nmbl-cli-'));
    writeFileSync(join(dir, 'a.nmbl'), 'div');
    writeFileSync(join(dir, 'b.vue'), '<template lang="nmbl">p hi</template>');
    writeFileSync(join(dir, 'readme.md'), '# hi');
    mkdirSync(join(dir, 'node_modules'));
    writeFileSync(join(dir, 'node_modules', 'skip.nmbl'), 'div');
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'sub', 'c.svelte'), '<template lang="nmbl">p hi</template>');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test('walks directory for supported files, skipping node_modules', () => {
    const files = collectFiles([dir]).map((f) => f.replace(dir + '/', ''));
    expect(files.sort()).toEqual(['a.nmbl', 'b.vue', 'sub/c.svelte']);
  });

  test('includes explicit file args', () => {
    const files = collectFiles([join(dir, 'a.nmbl')]);
    expect(files).toEqual([join(dir, 'a.nmbl')]);
  });

  test('throws on missing path', () => {
    expect(() => collectFiles([join(dir, 'nope.nmbl')])).toThrow();
  });
});
