import { describe, test, expect } from 'vitest';
import { Lexer } from '../src/lexer.js';
import { TokenType } from '../src/tokens.js';

function lex(input: string) {
  const lexer = new Lexer(input);
  return lexer.tokenize();
}

function tokenTypes(input: string): TokenType[] {
  const { tokens } = lex(input);
  return tokens.map(t => t.type);
}

function tokenNames(input: string): string[] {
  const { tokens } = lex(input);
  return tokens.map(t => {
    if ('name' in t) return `${t.type}:${t.name}`;
    if ('value' in t) return `${t.type}:${t.value}`;
    return t.type;
  });
}

describe('Lexer', () => {
  describe('basic elements', () => {
    test('single tag', () => {
      const types = tokenTypes('div');
      expect(types).toEqual([TokenType.Tag, TokenType.EOF]);
    });

    test('tag with id', () => {
      const names = tokenNames('div#app');
      expect(names).toEqual(['Tag:div', 'Id:app', 'EOF']);
    });

    test('tag with classes', () => {
      const names = tokenNames('div.foo.bar');
      expect(names).toEqual(['Tag:div', 'Class:foo', 'Class:bar', 'EOF']);
    });

    test('tag with id and classes', () => {
      const names = tokenNames('div#app.foo.bar');
      expect(names).toEqual(['Tag:div', 'Id:app', 'Class:foo', 'Class:bar', 'EOF']);
    });

    test('implicit div with id', () => {
      const names = tokenNames('#app');
      expect(names).toEqual(['Id:app', 'EOF']);
    });

    test('implicit div with class', () => {
      const names = tokenNames('.container');
      expect(names).toEqual(['Class:container', 'EOF']);
    });

    test('implicit div with id and classes', () => {
      const names = tokenNames('#app.foo.bar');
      expect(names).toEqual(['Id:app', 'Class:foo', 'Class:bar', 'EOF']);
    });
  });

  describe('indentation', () => {
    test('nested elements', () => {
      const types = tokenTypes('div\n  p');
      expect(types).toEqual([
        TokenType.Tag, // div
        TokenType.Indent,
        TokenType.Tag, // p
        TokenType.Outdent,
        TokenType.EOF,
      ]);
    });

    test('deeply nested', () => {
      const types = tokenTypes('div\n  p\n    span');
      expect(types).toEqual([
        TokenType.Tag, // div
        TokenType.Indent,
        TokenType.Tag, // p
        TokenType.Indent,
        TokenType.Tag, // span
        TokenType.Outdent,
        TokenType.Outdent,
        TokenType.EOF,
      ]);
    });

    test('siblings', () => {
      const types = tokenTypes('div\n  p\n  span');
      expect(types).toEqual([
        TokenType.Tag, // div
        TokenType.Indent,
        TokenType.Tag, // p
        TokenType.Tag, // span
        TokenType.Outdent,
        TokenType.EOF,
      ]);
    });

    test('blank lines ignored', () => {
      const types = tokenTypes('div\n\n  p');
      expect(types).toEqual([
        TokenType.Tag,
        TokenType.Indent,
        TokenType.Tag,
        TokenType.Outdent,
        TokenType.EOF,
      ]);
    });

    test('multiple outdents at once', () => {
      const types = tokenTypes('div\n  p\n    span\nhr');
      expect(types).toEqual([
        TokenType.Tag, // div
        TokenType.Indent,
        TokenType.Tag, // p
        TokenType.Indent,
        TokenType.Tag, // span
        TokenType.Outdent,
        TokenType.Outdent,
        TokenType.Tag, // hr
        TokenType.EOF,
      ]);
    });
  });

  describe('attributes', () => {
    test('simple attribute', () => {
      const { tokens } = lex('div(class="foo")');
      const attr = tokens.find(t => t.type === TokenType.Attribute);
      expect(attr).toBeDefined();
      expect((attr as any).name).toBe('class');
      expect((attr as any).value).toBe('foo');
      expect((attr as any).bound).toBe(false);
    });

    test('boolean attribute', () => {
      const { tokens } = lex('input(disabled)');
      const attr = tokens.find(t => t.type === TokenType.Attribute);
      expect(attr).toBeDefined();
      expect((attr as any).name).toBe('disabled');
      expect((attr as any).value).toBe(null);
      expect((attr as any).bound).toBe(false);
    });

    test('bound attribute', () => {
      const { tokens } = lex('div(:class="active")');
      const attr = tokens.find(t => t.type === TokenType.Attribute);
      expect(attr).toBeDefined();
      expect((attr as any).name).toBe('class');
      expect((attr as any).value).toBe('active');
      expect((attr as any).bound).toBe(true);
    });

    test('bound shorthand', () => {
      const { tokens } = lex('div(:firstName)');
      const attr = tokens.find(t => t.type === TokenType.Attribute);
      expect(attr).toBeDefined();
      expect((attr as any).name).toBe('firstName');
      expect((attr as any).value).toBe('firstName');
      expect((attr as any).bound).toBe(true);
    });

    test('template literal value', () => {
      const { tokens } = lex('div(:name=`${first} ${last}`)');
      const attr = tokens.find(t => t.type === TokenType.Attribute);
      expect(attr).toBeDefined();
      expect((attr as any).name).toBe('name');
      expect((attr as any).value).toBe('${first} ${last}');
      expect((attr as any).bound).toBe(true);
      expect((attr as any).templateLiteral).toBe(true);
    });

    test('multiple attributes', () => {
      const { tokens } = lex('div(class="foo" id="bar")');
      const attrs = tokens.filter(t => t.type === TokenType.Attribute);
      expect(attrs).toHaveLength(2);
      expect((attrs[0] as any).name).toBe('class');
      expect((attrs[1] as any).name).toBe('id');
    });

    test('multi-line attributes', () => {
      const { tokens } = lex('div(\n  class="foo"\n  id="bar"\n)');
      const attrs = tokens.filter(t => t.type === TokenType.Attribute);
      expect(attrs).toHaveLength(2);
    });

    test('single-quoted value spanning lines', () => {
      const { tokens } = lex("div(data='{\n  \"key\": \"val\"\n}')");
      const attr = tokens.find(t => t.type === TokenType.Attribute);
      expect(attr).toBeDefined();
      expect((attr as any).value).toBe('{\n  "key": "val"\n}');
    });

    test('comment inside attributes', () => {
      const { tokens } = lex('div(\n  class="foo"\n  // this is a comment\n  id="bar"\n)');
      const attrs = tokens.filter(t => t.type === TokenType.Attribute);
      expect(attrs).toHaveLength(2);
    });

    test('block comment inside attributes', () => {
      const { tokens } = lex('div(class="foo" /* comment */ id="bar")');
      const attrs = tokens.filter(t => t.type === TokenType.Attribute);
      expect(attrs).toHaveLength(2);
    });
  });

  describe('text', () => {
    test('inline text', () => {
      const { tokens } = lex('p Hello world');
      const text = tokens.find(t => t.type === TokenType.Text);
      expect(text).toBeDefined();
      expect((text as any).value).toBe('Hello world');
    });

    test('pipe text', () => {
      const { tokens } = lex('| Hello world');
      const text = tokens.find(t => t.type === TokenType.PipeText);
      expect(text).toBeDefined();
      expect((text as any).value).toBe('Hello world');
    });

    test('trailing backslash preserves whitespace', () => {
      const { tokens } = lex('p Hello \\');
      const text = tokens.find(t => t.type === TokenType.Text);
      expect(text).toBeDefined();
      expect((text as any).value).toBe('Hello ');
      expect((text as any).preserveTrailingWhitespace).toBe(true);
    });

    test('pipe text with trailing backslash', () => {
      const { tokens } = lex('| Hello \\');
      const text = tokens.find(t => t.type === TokenType.PipeText);
      expect(text).toBeDefined();
      expect((text as any).value).toBe('Hello ');
      expect((text as any).preserveTrailingWhitespace).toBe(true);
    });
  });

  describe('comments', () => {
    test('silent comment', () => {
      const { tokens } = lex('// this is a comment');
      const comment = tokens.find(t => t.type === TokenType.Comment);
      expect(comment).toBeDefined();
      expect((comment as any).value).toBe('this is a comment');
    });

    test('html comment', () => {
      const { tokens } = lex('//! this is visible');
      const comment = tokens.find(t => t.type === TokenType.HtmlComment);
      expect(comment).toBeDefined();
      expect((comment as any).value).toBe('this is visible');
    });

    test('block comment', () => {
      const { tokens } = lex('/* block comment */');
      const comment = tokens.find(t => t.type === TokenType.BlockComment);
      expect(comment).toBeDefined();
      expect((comment as any).value).toBe('block comment ');
    });

    test('block html comment', () => {
      const { tokens } = lex('/*! visible block */');
      const comment = tokens.find(t => t.type === TokenType.BlockHtmlComment);
      expect(comment).toBeDefined();
      expect((comment as any).value).toBe('visible block ');
    });
  });

  describe('content mode', () => {
    test('tag with text content mode', () => {
      const types = tokenTypes('div:\n  hello\n  world');
      expect(types).toContain(TokenType.ContentMode);
      expect(types).toContain(TokenType.ContentText);
    });

    test('tag with named content mode', () => {
      const { tokens } = lex('div:md\n  # Hello');
      const mode = tokens.find(t => t.type === TokenType.ContentMode);
      expect(mode).toBeDefined();
      expect((mode as any).name).toBe('md');
    });

    test('standalone content mode', () => {
      const { tokens } = lex(':md\n  # Hello');
      const mode = tokens.find(t => t.type === TokenType.ContentMode);
      expect(mode).toBeDefined();
      expect((mode as any).name).toBe('md');
    });
  });

  describe('block expansion', () => {
    test('colon space triggers block expansion', () => {
      const types = tokenTypes('li: a Home');
      expect(types).toContain(TokenType.Colon);
      expect(types).toContain(TokenType.Tag);
    });
  });

  describe('error recovery', () => {
    test('unterminated attributes produce error', () => {
      const { tokens, errors } = lex('div(class="foo"');
      expect(errors.length).toBeGreaterThan(0);
      // Should still produce AttrEnd for recovery
      expect(tokens.some(t => t.type === TokenType.AttrEnd)).toBe(true);
    });
  });
});
