// Smoke tests for the monogram-based NMBL grammar: lexing + CST shape.
import { describe, it, expect } from 'vitest';
import { createLexer } from 'monogram/src/gen-lexer.ts';
import { createParser } from 'monogram/src/gen-parser.ts';
import grammar from '../src/nmbl-grammar.ts';

const { tokenize } = createLexer(grammar as any);
const { parse } = createParser(grammar as any);

function tokenTypes(source: string): string[] {
  return tokenize(source).map((t: any) => `${t.type || 'punct'}:${t.text}`);
}

function parseOk(source: string) {
  const cst = parse(source);
  expect(cst, `parse returned null for:\n${source}`).not.toBeNull();
  return cst!;
}

describe('lexer', () => {
  it('lexes a bare tag line', () => {
    const types = tokenTypes('p hello world');
    expect(types[0]).toBe('TagName:p');
    expect(types.some(t => t.includes('hello'))).toBe(true);
  });

  it('lexes selector shorthand in block context', () => {
    const types = tokenTypes('div#app.dark');
    expect(types).toEqual(['TagName:div', 'IdSel:#app', 'ClassSel:.dark']);
  });

  it('lexes implicit-div selectors', () => {
    const types = tokenTypes('#app.dark');
    expect(types).toEqual(['IdSel:#app', 'ClassSel:.dark']);
  });

  it('lexes attribute names with sigils inside parens (flow)', () => {
    const types = tokenTypes('button(@click.stop="go" :disabled #slot)');
    expect(types).toContain('AttrName:@click.stop');
    expect(types).toContain('AttrName::disabled');
    expect(types).toContain('AttrName:#slot');
  });

  it('lexes multiline attributes (flow suspends indentation)', () => {
    const src = 'button(\n  type="submit"\n  class="btn"\n) Save';
    const types = tokenTypes(src);
    expect(types).toContain('AttrName:type');
    expect(types).toContain('DQString:"submit"');
    // no Newline/Indent tokens inside the parens
    expect(types.filter(t => t.startsWith('Newline') || t.startsWith('Indent'))).toEqual([]);
  });

  it('emits Indent/Dedent for nesting', () => {
    const types = tokenTypes('div\n  p hi');
    expect(types).toContain('Indent:');
    expect(types).toContain('Dedent:');
  });

  it('ignores silent comment lines for indentation', () => {
    const types = tokenTypes('div\n  // a note\n  p hi');
    expect(types.filter(t => t.startsWith('TagName:'))).toEqual(['TagName:div', 'TagName:p', 'TagName:hi']);
  });
});

describe('comments', () => {
  it('rendered //! comments are structural tokens; silent // lines vanish', () => {
    const types = tokenTypes('nav\n  // silent note\n  //! Navigation links\n  ul');
    expect(types).toContain('RenderedComment://! Navigation links');
    expect(types.join(' ')).not.toContain('silent note');
  });

  it('silent comments work inside attribute lists', () => {
    parseOk('button(\n  type="submit"\n  // disabled\n  class="btn"\n  /* aria-label="Save" */\n) Save');
    const types = tokenTypes('button(type="submit" // disabled\n class="btn")');
    expect(types.join(' ')).not.toContain('disabled');
  });

  it('trailing comments after tag content are stripped', () => {
    parseOk('div.foo // a note');
  });
});

describe('content blocks', () => {
  it('captures tag:mode raw blocks as one token', () => {
    const types = tokenTypes('article:md\n  ## Post\n  body text');
    expect(types[0]).toBe('TagName:article');
    expect(types[1]).toBe('RawContent::md\n  ## Post\n  body text');
  });

  it('captures bare script: blocks with arbitrary content', () => {
    parseOk('div\n  script:\n    const x = 1 < 2;\n    if (x) { go(); }\n  p after');
  });

  it('supports standalone :mode blocks', () => {
    parseOk(':md\n  # Heading\n  text');
  });

  it('does not trigger on text ending with a spaced colon', () => {
    const types = tokenTypes('p text ends with :\n  span child');
    expect(types.filter(t => t.startsWith('RawContent'))).toEqual([]);
  });
});

describe('parser', () => {
  it('parses a single element', () => {
    parseOk('p hello');
  });

  it('parses nesting', () => {
    parseOk('div#app\n  header.site\n    p hi\n  footer');
  });

  it('parses attributes', () => {
    parseOk('a.btn(href="/signup" disabled) Get Started');
  });

  it('parses multiline attributes', () => {
    parseOk('button(\n  type="submit"\n  class="btn"\n) Save');
  });

  it('parses block expansion', () => {
    parseOk('li > a(href="/") Home');
  });

  it('parses pipe text', () => {
    parseOk('p\n  | line one\n  | line two');
  });

  it('parses @-blocks', () => {
    parseOk('@if(loggedIn)\n  p Welcome\n@else\n  p Log in');
  });

  it('parses expression attribute values', () => {
    parseOk('button(onclick={() => toggle(item.id)}) Toggle');
  });

  it('CST spans cover the source', () => {
    const src = 'div#app\n  p.lead hello world';
    const cst = parseOk(src);
    expect(cst.offset).toBe(0);
    expect(cst.end).toBe(src.length);
  });

  it('parses raw HTML passthrough lines', () => {
    parseOk('<!DOCTYPE html>\nhtml\n  body\n    h1 Hi');
  });

  it('parses inline directives in text', () => {
    parseOk('p\n  | Hello {@html content}');
  });

  it('parses the full kitchen-sink template', () => {
    parseOk(`nav.main-nav
  ul
    li > a(href="/") Home
    li > a(href="/about") About

section#hero.dark
  h1 Welcome to NMBL
  p A concise template language for HTML

@if(loggedIn)
  p Welcome back, {user.name}!
@else
  p Please log in

form(action="/subscribe" method="post")
  input(type="email" name="email" required)
  button(type="submit") Subscribe

SomeComponent(
  :prop // note about this prop
  // anotherProp="temporarily disabled"
  another="foo"
)

article:md
  ## Embedded markdown
  With *content* here.`);
  });
});
