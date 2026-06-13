import { describe, it, expect } from 'vitest';
import monarchDef from '@nmbl-lang/core/monarch' with { type: 'json' };
import { MonarchTokenizer, type MonarchDefinition } from '../src/monarch-runtime.js';

const tok = new MonarchTokenizer(monarchDef as MonarchDefinition);

/** Tokenize lines and return the Monarch token name covering `needle` in `line`. */
function tokenAt(lines: string[], lineIdx: number, needle: string): string {
  const stack = tok.initialStack();
  let result = '';
  for (let i = 0; i < lines.length; i++) {
    const toks = tok.tokenizeLine(lines[i], stack);
    if (i !== lineIdx) continue;
    const at = lines[i].indexOf(needle);
    let pos = 0;
    for (const t of toks) {
      const end = pos + t.text.length;
      if (at >= pos && at < end) { result = t.token; break; }
      pos = end;
    }
  }
  return result;
}

describe('generated monarch tokenizer via the runtime', () => {
  it('tag heads: tag, glued class, glued attr name', () => {
    const line = 'a.btn(href="/x") Go';
    expect(tokenAt([line], 0, 'a.btn')).toBe('tag');
    expect(tokenAt([line], 0, '.btn')).toBe('attribute.name');
    expect(tokenAt([line], 0, 'href')).toBe('attribute.name');
    expect(tokenAt([line], 0, '"/x"')).toBe('string');
  });

  it('adjacency: spaced selector and paren are NOT class/attrs (the old hand tokenizer got this wrong)', () => {
    expect(tokenAt(['div .card'], 0, '.card')).not.toBe('attribute.name');
    expect(tokenAt(['div (x)'], 0, 'x')).not.toBe('attribute.name');
    // glued forms still are
    expect(tokenAt(['div.card'], 0, '.card')).toBe('attribute.name');
    expect(tokenAt(['div(x)'], 0, 'x')).toBe('attribute.name');
  });

  it('inline text after the head is not a tag', () => {
    expect(tokenAt(['p hello world'], 0, 'hello')).not.toBe('tag');
    expect(tokenAt(['p hello world'], 0, 'world')).not.toBe('tag');
  });

  it('pipe text lines are not tags', () => {
    expect(tokenAt(['p', '  | piped text here'], 1, 'piped')).not.toBe('tag');
  });

  it('comments', () => {
    expect(tokenAt(['// dev note'], 0, 'dev')).toBe('comment');
    expect(tokenAt(['//! rendered comment'], 0, 'rendered')).toBe('comment');
  });

  it('multi-line attribute lists keep attr context across lines', () => {
    const lines = ['button(', '  type="submit"', ') Save'];
    expect(tokenAt(lines, 1, 'type')).toBe('attribute.name');
    expect(tokenAt(lines, 1, '"submit"')).toBe('string');
  });

  it('per-line reset: a tag-shaped word on the next line is a fresh tag head', () => {
    const lines = ['div.a', 'span.b'];
    expect(tokenAt(lines, 1, 'span')).toBe('tag');
    expect(tokenAt(lines, 1, '.b')).toBe('attribute.name');
  });

  it('template strings with interpolation', () => {
    expect(tokenAt(['a(href=`/u/${id}`) x'], 0, '`/u/')).toBe('string');
  });

  it('never stalls: tokenizeLine always terminates and covers the whole line', () => {
    for (const line of ['', '   ', '((((', '@#$%^&*', 'div.card(href="x" :bound @click={() => f({a:1})}) text `t${x}`']) {
      const stack = tok.initialStack();
      const toks = tok.tokenizeLine(line, stack);
      expect(toks.map(t => t.text).join('')).toBe(line);
    }
  });
});
