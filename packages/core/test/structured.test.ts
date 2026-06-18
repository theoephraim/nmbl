import { describe, test, expect } from 'vitest';
import { parseStructured } from '../src/structured.js';

describe('parseStructured', () => {
  test('parses YAML frontmatter into an object', () => {
    const { frontmatter, errors } = parseStructured('---\ntitle: Hi\ntags: [a, b]\n---\ndiv');
    expect(errors).toHaveLength(0);
    expect(frontmatter).toEqual({ title: 'Hi', tags: ['a', 'b'] });
  });

  test('no frontmatter → empty object', () => {
    const { frontmatter } = parseStructured('div');
    expect(frontmatter).toEqual({});
  });

  test('returns the frontmatter-stripped body for re-rendering', () => {
    const { body } = parseStructured('---\ntitle: X\n---\ndiv hi');
    expect(body).toBe('div hi');
  });

  test('invalid YAML is reported as an error, body still parses', () => {
    const { frontmatter, tree, errors } = parseStructured('---\n: : bad\n---\ndiv');
    expect(errors.some(e => e.code === 'INVALID_FRONTMATTER')).toBe(true);
    expect(frontmatter).toEqual({});
    expect(tree).toHaveLength(1);
  });

  test('folds shorthand id/class and explicit attributes into a flat map', () => {
    const { tree } = parseStructured('section#main.a.b(role="region" data-x="1")');
    expect(tree[0]).toMatchObject({
      type: 'element',
      tag: 'section',
      attrs: { id: 'main', class: 'a b', role: 'region', 'data-x': '1' },
    });
  });

  test('boolean attribute becomes true', () => {
    const { tree } = parseStructured('input(required)');
    expect((tree[0] as any).attrs.required).toBe(true);
  });

  test('content-mode body is kept as raw text, not rendered', () => {
    const { tree } = parseStructured('body:md\n  # Title\n  **bold** stays literal');
    expect(tree[0]).toMatchObject({
      type: 'element',
      tag: 'body',
      content: { mode: 'md', text: '# Title\n**bold** stays literal' },
    });
    expect((tree[0] as any).children).toEqual([]);
  });

  test('nested elements and inline text', () => {
    const { tree } = parseStructured('doc\n  title Q3 earnings');
    expect(tree[0]).toMatchObject({
      tag: 'doc',
      children: [
        { type: 'element', tag: 'title', children: [{ type: 'text', value: 'Q3 earnings' }] },
      ],
    });
  });

  test('PascalCase tags are flagged as components', () => {
    const { tree } = parseStructured('Card(title="x")');
    expect(tree[0]).toMatchObject({ tag: 'Card', component: true });
  });

  test('control-flow blocks are omitted from the static tree', () => {
    const { tree } = parseStructured('ul\n  @each(x of xs)\n    li item');
    // the @each block is dropped; only the <ul> element remains
    expect(tree).toHaveLength(1);
    expect((tree[0] as any).children).toEqual([]);
  });
});
