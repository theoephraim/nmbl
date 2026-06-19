/**
 * Unit tests for the pure helpers in client/convert.ts and a real-parser
 * round-trip integration test using @nmbl-lang/core directly.
 *
 * The `vscode` module is aliased to a minimal stub via vitest.config.ts.
 * @nmbl-lang/core is resolved to packages/core/dist/index.mjs via the alias.
 */

import { describe, it, expect } from 'vitest';
import {
  looksLikeHtml,
  containsSvg,
  reindent,
  dedentSelection,
  chooseFramework,
} from '../client/convert';
import { compile, decompile } from '@nmbl-lang/core';

// ---------------------------------------------------------------------------
// looksLikeHtml
// ---------------------------------------------------------------------------

describe('looksLikeHtml', () => {
  // Positive cases — should be detected as HTML
  it('detects a basic div element', () => {
    expect(looksLikeHtml('<div class="x">hi</div>')).toBe(true);
  });

  it('detects a self-closing void tag', () => {
    expect(looksLikeHtml('<br/>')).toBe(true);
  });

  it('detects a multi-line document fragment', () => {
    const html = '<div>\n  <p>Hello</p>\n  <p>World</p>\n</div>';
    expect(looksLikeHtml(html)).toBe(true);
  });

  it('detects an img tag with attributes', () => {
    expect(looksLikeHtml('<img src="photo.jpg" alt="photo"/>')).toBe(true);
  });

  it('detects a comment-containing fragment', () => {
    expect(looksLikeHtml('<div><!-- comment --></div>')).toBe(true);
  });

  it('detects a closing-tag-only fragment', () => {
    // </div> starts with </ which passes the regex <[a-zA-Z!/]
    expect(looksLikeHtml('</div>')).toBe(true);
  });

  it('detects a standalone void element (no self-close slash)', () => {
    // <br> ends with > and matches /^<[a-zA-Z][^>]*>$/
    expect(looksLikeHtml('<br>')).toBe(true);
  });

  // Negative cases — should NOT be detected as HTML
  it('rejects plain text', () => {
    expect(looksLikeHtml('hello world')).toBe(false);
  });

  it('rejects NMBL-style text (selector syntax)', () => {
    expect(looksLikeHtml('div.card hi')).toBe(false);
  });

  it('rejects a comparison expression', () => {
    expect(looksLikeHtml('a < b')).toBe(false);
  });

  it('rejects JavaScript code with comparison', () => {
    expect(looksLikeHtml('if (a<b) {}')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(looksLikeHtml('')).toBe(false);
  });

  it('rejects whitespace only', () => {
    expect(looksLikeHtml('   ')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSvg
// ---------------------------------------------------------------------------

describe('containsSvg', () => {
  it('detects an svg document with attributes', () => {
    expect(containsSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16"/></svg>')).toBe(true);
  });

  it('detects a bare <svg> and tolerates surrounding whitespace', () => {
    expect(containsSvg('<svg>')).toBe(true);
    expect(containsSvg('  \n  <svg viewBox="0 0 10 10"></svg>')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(containsSvg('<SVG></SVG>')).toBe(true);
  });

  it('detects svg nested inside other markup', () => {
    expect(containsSvg('<div><svg></svg></div>')).toBe(true);
    expect(containsSvg('<button class="icon-btn"><svg viewBox="0 0 24 24"><path d="M4 4"/></svg> Save</button>')).toBe(true);
  });

  it('does not match svg lookalikes or the closing tag alone', () => {
    expect(containsSvg('<path d="M4 4h16"/>')).toBe(false);
    expect(containsSvg('<svganimate>')).toBe(false); // must be the svg element, not a prefix
    expect(containsSvg('</svg>')).toBe(false); // closing tag only, no opening
    expect(containsSvg('<div>plain html</div>')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// reindent
// ---------------------------------------------------------------------------

describe('reindent', () => {
  it('leaves a single line unchanged', () => {
    expect(reindent('div.card', '  ')).toBe('div.card');
  });

  it('does not double-prefix the first line', () => {
    const nmbl = 'div.card\n  p Hello';
    // First line should NOT get the prefix, second line SHOULD
    expect(reindent(nmbl, '    ')).toBe('div.card\n      p Hello');
  });

  it('handles three lines correctly', () => {
    const nmbl = 'ul\n  li One\n  li Two';
    const result = reindent(nmbl, '\t');
    expect(result).toBe('ul\n\t  li One\n\t  li Two');
  });

  it('strips a trailing newline from the decompiler', () => {
    // decompile always adds a trailing \n — reindent should strip it
    const nmbl = 'div.box\n';
    expect(reindent(nmbl, '  ')).toBe('div.box');
  });

  it('works with empty indent prefix', () => {
    const nmbl = 'section\n  h1 Title\n';
    expect(reindent(nmbl, '')).toBe('section\n  h1 Title');
  });
});

// ---------------------------------------------------------------------------
// dedentSelection
// ---------------------------------------------------------------------------

describe('dedentSelection', () => {
  it('strips common 2-space indent from all lines', () => {
    const input = '  div\n    p Hello\n    p World';
    expect(dedentSelection(input)).toBe('div\n  p Hello\n  p World');
  });

  it('strips common 4-space indent', () => {
    const input = '    ul\n      li One\n      li Two';
    expect(dedentSelection(input)).toBe('ul\n  li One\n  li Two');
  });

  it('leaves already-zero-indented text untouched', () => {
    const input = 'div\n  p Hello';
    expect(dedentSelection(input)).toBe('div\n  p Hello');
  });

  it('ignores blank lines when computing common indent', () => {
    const input = '  div\n\n  p Hello';
    expect(dedentSelection(input)).toBe('div\n\np Hello');
  });

  it('strips tab indentation', () => {
    const input = '\tul\n\t  li One';
    expect(dedentSelection(input)).toBe('ul\n  li One');
  });

  it('handles single-line input', () => {
    expect(dedentSelection('  p Hello')).toBe('p Hello');
  });
});

// ---------------------------------------------------------------------------
// chooseFramework
// ---------------------------------------------------------------------------

describe('chooseFramework', () => {
  it('returns vue for vue languageId', () => {
    expect(chooseFramework('vue')).toBe('vue');
  });

  it('returns svelte for svelte languageId', () => {
    expect(chooseFramework('svelte')).toBe('svelte');
  });

  it('returns astro for astro languageId', () => {
    expect(chooseFramework('astro')).toBe('astro');
  });

  it('returns html for nmbl languageId', () => {
    expect(chooseFramework('nmbl')).toBe('html');
  });

  it('returns html for unknown languageId', () => {
    expect(chooseFramework('javascript')).toBe('html');
  });
});

// ---------------------------------------------------------------------------
// Round-trip integration tests using the real @nmbl-lang/core
// ---------------------------------------------------------------------------

describe('decompile → compile round-trip (real parser)', () => {
  it('decompiles a div with class to NMBL selector syntax', () => {
    const html = '<div class="card"><p>Hello</p></div>';
    const nmbl = decompile(html);
    // The decompiler emits .card (div is implicit as the default block element)
    expect(nmbl).toContain('.card');
    expect(nmbl).toContain('p');
    expect(nmbl).toContain('Hello');
  });

  it('compiles NMBL back to HTML', () => {
    const nmbl = 'div.card\n  p Hello\n';
    const result = compile(nmbl);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('<div');
    expect(result.html).toContain('class="card"');
    expect(result.html).toContain('<p>');
    expect(result.html).toContain('Hello');
  });

  it('decompiles a multi-element fragment', () => {
    const html = '<ul><li>One</li><li>Two</li></ul>';
    const nmbl = decompile(html);
    expect(nmbl).toContain('ul');
    expect(nmbl).toContain('li');
    expect(nmbl).toContain('One');
    expect(nmbl).toContain('Two');
  });

  it('compiles and decompile produce non-empty results for a snippet', () => {
    const html = '<section class="hero"><h1>Title</h1><p>Subtitle</p></section>';
    const nmbl = decompile(html);
    expect(nmbl.trim()).toBeTruthy();
    const result = compile(nmbl);
    expect(result.errors).toHaveLength(0);
    expect(result.html.trim()).toBeTruthy();
  });
});
