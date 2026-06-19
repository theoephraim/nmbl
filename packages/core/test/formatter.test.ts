import { describe, test, expect } from 'vitest';
import { format, compile } from '../src/index.js';
import type { CompilerOptions } from '../src/compiler.js';

function dedent(strings: TemplateStringsArray, ...values: unknown[]): string {
  let result = String.raw(strings, ...values);
  result = result.replace(/^\n/, '');
  const lines = result.split('\n');
  const minIndent = lines
    .filter((l) => l.trim().length > 0)
    .reduce((min, l) => Math.min(min, l.match(/^(\s*)/)?.[1].length ?? 0), Infinity);
  return lines.map((l) => l.slice(minIndent)).join('\n').trimEnd();
}

/** Assert input formats to exactly `expected` (trimmed of trailing newline). */
function expectFormat(input: string, expected: string) {
  const r = format(input);
  expect(r.errors).toEqual([]);
  expect(r.code.replace(/\n$/, '')).toBe(expected);
}

describe('formatter — canonicalization', () => {
  test('normalizes indentation to 2 spaces', () => {
    expectFormat('div\n        span     Hello', 'div\n  span Hello');
  });

  test('honors custom indent width', () => {
    const r = format('div\n  span hi', { indent: 4 });
    expect(r.code).toBe('div\n    span hi\n');
  });

  test('drops redundant div before id/class shorthand', () => {
    expectFormat('div.card.dark(role="region")', '.card.dark(role="region")');
    expectFormat('div#main', '#main');
  });

  test('keeps bare div', () => {
    expectFormat('div', 'div');
  });

  test('canonical selector order: tag#id.class', () => {
    expectFormat('section#hero.full.dark', 'section#hero.full.dark');
  });

  test('inlines single text child', () => {
    expectFormat('p\n  | Hello world', 'p Hello world');
  });

  test('pipes multiple text children', () => {
    expectFormat('div\n  | one\n  | two', 'div\n  | one\n  | two');
  });

  test('block expansion stays on one line', () => {
    expectFormat('li > a(href="/") Home', 'li > a(href="/") Home');
  });

  test('boolean and bound-shorthand attributes', () => {
    expectFormat('input(type="text" disabled)', 'input(type="text" disabled)');
    expectFormat('div(:foo)', 'div(:foo)');
  });

  test('prefers double quotes, falls back to single', () => {
    expectFormat(`div(title='hi')`, `div(title="hi")`);
    expectFormat(`div(title='say "hi"')`, `div(title='say "hi"')`);
  });

  test('preserves expression and template-literal attributes', () => {
    expectFormat('div(:count={n + 1})', 'div(:count={n + 1})');
    expectFormat('div(foo=`a${b}c`)', 'div(foo=`a${b}c`)');
  });

  test('strips trailing whitespace and ensures final newline', () => {
    const r = format('p hi   ');
    expect(r.code).toBe('p hi\n');
  });
});

describe('formatter — @each normalization', () => {
  test('default target → portable of-form with :key', () => {
    expectFormat(
      '@each(items as item, i (item.id))\n  li hi',
      '@each(item, i of items :key="item.id")\n  li hi',
    );
  });

  test('canonical of-form preserved (default target)', () => {
    expectFormat(
      '@each(item of items :key="item.id")\n  li hi',
      '@each(item of items :key="item.id")\n  li hi',
    );
  });

  test('svelte target → native as-form with (key)', () => {
    const r = format('@each(item of items :key="item.id")\n  li hi', { framework: 'svelte' });
    expect(r.code).toBe('@each(items as item (item.id))\n  li hi\n');
  });

  test('svelte target keeps multi-binding as-form', () => {
    const r = format('@each(item, i of items :key="item.id")\n  li hi', { framework: 'svelte' });
    expect(r.code).toBe('@each(items as item, i (item.id))\n  li hi\n');
  });

  test('svelte as-form is idempotent under svelte target', () => {
    const once = format('@each(items as item, i (item.id))\n  li hi', { framework: 'svelte' });
    const twice = format(once.code, { framework: 'svelte' });
    expect(twice.code).toBe(once.code);
  });

  test('vue target stays on of-form', () => {
    const r = format('@each(items as item :key="item.id")\n  li hi', { framework: 'vue' });
    expect(r.code).toBe('@each(item of items :key="item.id")\n  li hi\n');
  });
});

describe('formatter — @-blocks', () => {
  test('if/elseif/else chain', () => {
    expectFormat(
      dedent`
        @if(a)
          p one
        @elseif(b)
          p two
        @else
          p three
      `,
      '@if(a)\n  p one\n@elseif(b)\n  p two\n@else\n  p three',
    );
  });
});

describe('formatter — comments', () => {
  test('rendered comments preserved', () => {
    expectFormat('//! a note', '//! a note');
  });

  test('silent line comment preserved at top level', () => {
    expectFormat('// todo\ndiv', '// todo\ndiv');
  });

  test('silent comment nested under element', () => {
    expectFormat('div\n  // inner\n  p hi', 'div\n  // inner\n  p hi');
  });

  test('trailing comment stays on the same line', () => {
    const r = format('div // trailing');
    expect(r.code).toBe('div // trailing\n');
  });

  test('comment inside attribute list forces a wrap', () => {
    const r = format('div(\n  foo="bar"\n  // note\n  :baz\n) text');
    expect(r.code).toBe('div(\n  foo="bar"\n  // note\n  :baz\n) text\n');
  });
});

describe('formatter — blank lines', () => {
  test('collapses multiple blanks to one between siblings', () => {
    expectFormat('div\n\n\n\nspan', 'div\n\nspan');
  });

  test('removes leading/trailing blank lines', () => {
    const r = format('\n\ndiv\n\n');
    expect(r.code).toBe('div\n');
  });
});

describe('formatter — safety', () => {
  test('returns source untouched on parse error', () => {
    const broken = 'div(foo="bar';
    const r = format(broken);
    expect(r.formatted).toBe(false);
    expect(r.code).toBe(broken);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  test('empty input', () => {
    expect(format('').code).toBe('');
    expect(format('   \n  \n').code).toBe('');
  });
});

// ── Corpus: every entry must (a) format idempotently and (b) preserve
//    semantics — compile(src) === compile(format(src)). ──
const CORPUS: Array<{ name: string; src: string; framework?: CompilerOptions['framework'] }> = [
  { name: 'nested', src: 'div\n  p Hello\n  span World' },
  { name: 'shorthand', src: '#app.container.dark(data-x="1")\n  h1 Title' },
  { name: 'block expansion', src: 'ul\n  li > a(href="/") Home\n  li > a(href="/about") About' },
  { name: 'void elements', src: 'input(type="text" required)\nbr\nimg(src="/a.png" alt="a")' },
  { name: 'mixed attrs', src: 'div(class="x" :count={1 + 2} foo=`t${v}` disabled)' },
  { name: 'rendered comment', src: '//! hello\ndiv' },
  { name: 'multiline text', src: 'p\n  | line one\n  | line two' },
  { name: 'component', src: 'MyComponent(:prop={value})\n  span child' },
  { name: 'if block', src: '@if(loggedIn)\n  p Welcome\n@else\n  p Login', framework: 'svelte' },
  { name: 'each block', src: '@each(item of items :key="item.id")\n  li hi', framework: 'svelte' },
  { name: 'each vue multi', src: '@each(value, key of obj)\n  li hi', framework: 'vue' },
  { name: 'await block', src: '@await(promise)\n  p loading\n@then(data)\n  p {data}\n@catch(e)\n  p err', framework: 'svelte' },
  { name: 'script block', src: 'script:\n  const x = 1\n  console.log(x)', framework: 'svelte' },
  { name: 'style block', src: 'style:\n  body { color: red; }', framework: 'svelte' },
  { name: 'comments deep', src: '// top\ndiv\n  // mid\n  p hi // trailing' },
  { name: 'blank lines', src: 'header\n\nmain\n  p hi\n\nfooter' },
];

describe('formatter — idempotency', () => {
  for (const { name, src, framework } of CORPUS) {
    test(name, () => {
      const opts = framework ? { framework } : undefined;
      const once = format(src, opts);
      expect(once.errors).toEqual([]);
      const twice = format(once.code, opts);
      expect(twice.code).toBe(once.code);
    });
  }
});

describe('formatter — semantics preservation', () => {
  for (const { name, src, framework } of CORPUS) {
    test(name, () => {
      const opts = framework ? { framework } : undefined;
      const before = compile(src, opts);
      expect(before.errors).toEqual([]);
      const formatted = format(src, opts);
      expect(formatted.errors).toEqual([]);
      const after = compile(formatted.code, opts);
      expect(after.errors).toEqual([]);
      expect(after.html.trim()).toBe(before.html.trim());
    });
  }
});
