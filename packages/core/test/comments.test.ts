// Proof of the trivia-recovery invariant: every silent comment the parser
// swallows is deterministically recoverable from source — the foundation a
// future formatter builds on.
import { describe, it, expect } from 'vitest';
import { recoverComments } from '../src/comments.js';

describe('recoverComments', () => {
  it('recovers comment-only lines (swallowed pre-tokenization)', () => {
    const out = recoverComments('div\n  // a note\n  p hi');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ text: '// a note', kind: 'line' });
  });

  it('recovers trailing comments after tag content', () => {
    const out = recoverComments('div.foo // trailing note');
    expect(out.map(c => c.text)).toEqual(['// trailing note']);
  });

  it('recovers comments inside attribute lists', () => {
    const src = 'button(\n  type="submit"\n  // disabled\n  /* aria-label="Save" */\n  class="btn"\n) Save';
    const out = recoverComments(src);
    expect(out.map(c => c.text)).toEqual(['// disabled', '/* aria-label="Save" */']);
    expect(out.map(c => c.kind)).toEqual(['line', 'block']);
  });

  it('offsets point at the verbatim source span', () => {
    const src = 'div\n  // hello\n  p x';
    const [c] = recoverComments(src);
    expect(src.slice(c.offset, c.end)).toBe(c.text);
  });

  it('does NOT report // inside strings, raw blocks, or text', () => {
    const src = [
      'a(href="https://example.com") visit https://example.com',
      'script:',
      '  // real js comment, part of raw content',
      '  const url = "http://x";',
    ].join('\n');
    expect(recoverComments(src)).toHaveLength(0);
  });

  it('does NOT report rendered //! comments (they are retained tokens)', () => {
    const out = recoverComments('//! rendered\n// silent');
    expect(out.map(c => c.text)).toEqual(['// silent']);
  });

  it('recovers multiple comments across a realistic template', () => {
    const src = [
      '// header note',
      'nav.main',
      '  // todo: more links',
      '  ul',
      '    li > a(href="/") Home // inline note',
      '',
      '/* block',
      '   comment */',
      'footer',
    ].join('\n');
    const texts = recoverComments(src).map(c => c.text);
    expect(texts).toContain('// header note');
    expect(texts).toContain('// todo: more links');
    expect(texts).toContain('// inline note');
    expect(texts.some(t => t.startsWith('/* block'))).toBe(true);
  });
});
