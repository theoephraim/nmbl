// Highlighting fidelity: the GENERATED TextMate grammar must honor selector/attr
// gluing — `div.card(attrs)` scopes each part, and a SPACE breaks the head so
// what follows is plain text (not a class / attr / tag). Tokenized with the real
// vscode-textmate engine against the generated grammar.
import { describe, test, expect } from 'vitest';
import { scopeOf } from './tm-scopes.ts';

const CLASS = 'entity.other.attribute-name.class.nmbl';
const ID = 'entity.other.attribute-name.id.nmbl';
const TAG = 'entity.name.tag.nmbl';
const ATTR = 'entity.other.attribute-name.nmbl';
const TEXT = 'text.nmbl';

describe('TextMate highlighting — selector/attr gluing', () => {
  test('glued tag.class(attr) scopes each part', async () => {
    const line = 'div.card(foo="1") text';
    expect(await scopeOf(line, 'div')).toBe(TAG);
    expect(await scopeOf(line, '.card')).toBe(CLASS);
    expect(await scopeOf(line, 'foo')).toBe(ATTR);
    expect(await scopeOf(line, '"')).toBe('punctuation.definition.string.begin.nmbl');
    // interior text after the head is NOT a tag
    expect(await scopeOf(line, 'text')).toBe(TEXT);
  });

  test('spaced selector is text, not a class', async () => {
    const line = 'div .card x';
    expect(await scopeOf(line, 'div')).toBe(TAG);
    expect(await scopeOf(line, '.card')).toBe(TEXT);
    expect(await scopeOf(line, 'x')).toBe(TEXT);
  });

  test('spaced paren content is text, not an attribute or tag', async () => {
    const line = 'p (foo) bar';
    expect(await scopeOf(line, 'p')).toBe(TAG);
    expect(await scopeOf(line, 'foo')).toBe(TEXT);
    expect(await scopeOf(line, 'bar')).toBe(TEXT);
  });

  test('implicit-div leading selector still binds', async () => {
    expect(await scopeOf('.box hi', '.box')).toBe(CLASS);
    expect(await scopeOf('.box hi', 'hi')).toBe(TEXT);
    expect(await scopeOf('#app x', '#app')).toBe(ID);
  });

  test('block expansion: the expanded tag head is highlighted', async () => {
    const line = 'li > a(href="/") Home';
    expect(await scopeOf(line, 'li')).toBe(TAG);
    expect(await scopeOf(line, 'a(')).toBe(TAG);
    expect(await scopeOf(line, 'href')).toBe(ATTR);
    expect(await scopeOf(line, 'Home')).toBe(TEXT);
  });

  test('multi-attribute list keeps attr scopes; trailing text is text', async () => {
    const line = 'div(a="1" b="2") x';
    expect(await scopeOf(line, 'a=')).toBe(ATTR);
    expect(await scopeOf(line, 'b=')).toBe(ATTR);
    expect(await scopeOf(line, 'x')).toBe(TEXT);
  });

  test('other line forms are unaffected', async () => {
    expect(await scopeOf('| just text', 'just')).toBe(TEXT);
    expect(await scopeOf('// note', '// note')).toBe('comment.line.double-slash.nmbl');
    expect(await scopeOf('@if(cond)', '@if')).toBe('keyword.control.nmbl');
  });
});
