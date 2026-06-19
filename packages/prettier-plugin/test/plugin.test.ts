import { test, expect } from 'vitest';
import * as prettier from 'prettier';
import * as nmblPlugin from '../src/index.js';

// prettier.format is async in v3 — every call must be awaited.
const fmt = (src: string, opts: Record<string, unknown> = {}) =>
  prettier.format(src, {
    parser: 'nmbl',
    plugins: [nmblPlugin as any],
    ...opts,
  });

test('normalizes messy indentation to 2 spaces', async () => {
  const messy = ['div', '        span', '                a Hello'].join('\n');
  const out = await fmt(messy);
  expect(out).toContain('\n  span');
  expect(out).toContain('\n    a Hello');
  // no stray 8-space indentation survived
  expect(out).not.toContain('        span');
});

test('shorthands redundant div selector (div.card -> .card)', async () => {
  const out = await fmt('div.card');
  expect(out.trim()).toBe('.card');
});

test('is idempotent (format twice === format once)', async () => {
  const src = ['div.card', '  span.title a Hi', '  p Some text'].join('\n');
  const once = await fmt(src);
  const twice = await fmt(once);
  expect(twice).toBe(once);
});

test('tabWidth: 4 produces 4-space indentation', async () => {
  const src = ['div', '  span', '    a Deep'].join('\n');
  const out = await fmt(src, { tabWidth: 4 });
  expect(out).toContain('\n    span');
  expect(out).toContain('\n        a Deep');
});

test('returns unparseable input unchanged', async () => {
  const broken = 'div(foo="bar';
  const out = await fmt(broken);
  expect(out.trim()).toBe(broken.trim());
});

test('output ends with exactly one trailing newline', async () => {
  const out = await fmt('div.card\n\n\n');
  expect(out.endsWith('\n')).toBe(true);
  expect(out.endsWith('\n\n')).toBe(false);
});

test('already-clean input round-trips with a single trailing newline', async () => {
  const clean = '.card\n';
  const out = await fmt(clean);
  expect(out).toBe(clean);
});
