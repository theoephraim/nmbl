import { describe, test, expect } from 'vitest';
import { lint } from '../src/index.js';

const ids = (src: string, opts?: Parameters<typeof lint>[1]) =>
  lint(src, opts).map((m) => m.ruleId);

describe('linter', () => {
  test('clean source has no messages', () => {
    expect(lint('.card\n  p hi')).toEqual([]);
  });

  test('no-duplicate-attributes', () => {
    const msgs = lint('div(foo="a" foo="b")');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].ruleId).toBe('no-duplicate-attributes');
    expect(msgs[0].severity).toBe('error');
    expect(msgs[0].fixable).toBe(false);
  });

  test('bound and unbound names are distinct', () => {
    expect(ids('div(:foo foo="x")')).toEqual([]);
  });

  test('no-duplicate-classes', () => {
    const msgs = lint('.a.b.a');
    expect(msgs.map((m) => m.ruleId)).toContain('no-duplicate-classes');
    expect(msgs.find((m) => m.ruleId === 'no-duplicate-classes')!.fixable).toBe(true);
  });

  test('prefer-div-shorthand', () => {
    expect(ids('div.card hi')).toContain('prefer-div-shorthand');
    expect(ids('.card hi')).not.toContain('prefer-div-shorthand');
    expect(ids('div hi')).not.toContain('prefer-div-shorthand');
  });

  test('component-pascal-case flags mixed-case tags', () => {
    expect(ids('dIv hi')).toContain('component-pascal-case');
    expect(ids('MyComp hi')).not.toContain('component-pascal-case');
    expect(ids('my-element hi')).not.toContain('component-pascal-case');
  });

  test('descends into children and blocks', () => {
    const src = '@if(x)\n  div(a="1" a="2")\n    span.z.z';
    const got = ids(src, { rules: {} });
    expect(got).toContain('no-duplicate-attributes');
    expect(got).toContain('no-duplicate-classes');
  });

  test('rules can be turned off', () => {
    expect(ids('div.card hi', { rules: { 'prefer-div-shorthand': 'off' } })).toEqual([]);
  });

  test('severity can be overridden', () => {
    const msgs = lint('div.card hi', { rules: { 'prefer-div-shorthand': 'error' } });
    expect(msgs[0].severity).toBe('error');
  });

  test('parse errors surface as parse-error messages', () => {
    const msgs = lint('@else\n  p x');
    expect(msgs.some((m) => m.ruleId === 'parse-error' && m.severity === 'error')).toBe(true);
  });

  test('messages are sorted by source position', () => {
    const msgs = lint('span.z.z\ndiv(a="1" a="2")');
    const offsets = msgs.map((m) => m.span.start.offset);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  });
});
