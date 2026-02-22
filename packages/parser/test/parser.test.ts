import { describe, test, expect } from 'vitest';
import { Lexer } from '../src/lexer.js';
import { Parser } from '../src/parser.js';
import type { ElementNode, TextNode, CommentNode, HtmlCommentNode, ContentBlockNode, BlockNode, InlineDirectiveNode } from '../src/ast.js';

function parseSource(input: string) {
  const lexer = new Lexer(input);
  const { tokens, errors: lexErrors } = lexer.tokenize();
  const parser = new Parser(tokens);
  const { ast, errors: parseErrors } = parser.parse();
  return { ast, errors: [...lexErrors, ...parseErrors] };
}

describe('Parser', () => {
  describe('elements', () => {
    test('single element', () => {
      const { ast, errors } = parseSource('div');
      expect(errors).toHaveLength(0);
      expect(ast.children).toHaveLength(1);
      const el = ast.children[0] as ElementNode;
      expect(el.type).toBe('Element');
      expect(el.tagName).toBe('div');
      expect(el.isComponent).toBe(false);
      expect(el.isImplicitDiv).toBe(false);
    });

    test('component (PascalCase)', () => {
      const { ast, errors } = parseSource('MyComponent');
      expect(errors).toHaveLength(0);
      const el = ast.children[0] as ElementNode;
      expect(el.isComponent).toBe(true);
    });

    test('void element', () => {
      const { ast, errors } = parseSource('br');
      expect(errors).toHaveLength(0);
      const el = ast.children[0] as ElementNode;
      expect(el.isVoid).toBe(true);
    });

    test('CSS shorthand', () => {
      const { ast, errors } = parseSource('div#app.main.container');
      expect(errors).toHaveLength(0);
      const el = ast.children[0] as ElementNode;
      expect(el.id).toBe('app');
      expect(el.classes).toEqual(['main', 'container']);
    });

    test('implicit div with id', () => {
      const { ast, errors } = parseSource('#app');
      expect(errors).toHaveLength(0);
      const el = ast.children[0] as ElementNode;
      expect(el.tagName).toBe('div');
      expect(el.isImplicitDiv).toBe(true);
      expect(el.id).toBe('app');
    });

    test('implicit div with class', () => {
      const { ast, errors } = parseSource('.container');
      expect(errors).toHaveLength(0);
      const el = ast.children[0] as ElementNode;
      expect(el.tagName).toBe('div');
      expect(el.isImplicitDiv).toBe(true);
      expect(el.classes).toEqual(['container']);
    });
  });

  describe('nesting', () => {
    test('nested children', () => {
      const { ast, errors } = parseSource('div\n  p\n  span');
      expect(errors).toHaveLength(0);
      const div = ast.children[0] as ElementNode;
      expect(div.children).toHaveLength(2);
      expect((div.children[0] as ElementNode).tagName).toBe('p');
      expect((div.children[1] as ElementNode).tagName).toBe('span');
    });

    test('deeply nested', () => {
      const { ast, errors } = parseSource('div\n  p\n    span');
      expect(errors).toHaveLength(0);
      const div = ast.children[0] as ElementNode;
      const p = div.children[0] as ElementNode;
      const sp = p.children[0] as ElementNode;
      expect(sp.tagName).toBe('span');
    });
  });

  describe('attributes', () => {
    test('static attribute', () => {
      const { ast, errors } = parseSource('div(class="foo")');
      expect(errors).toHaveLength(0);
      const el = ast.children[0] as ElementNode;
      expect(el.attributes).toHaveLength(1);
      expect(el.attributes[0].name).toBe('class');
      expect(el.attributes[0].value).toBe('foo');
      expect(el.attributes[0].bound).toBe(false);
    });

    test('bound attribute', () => {
      const { ast, errors } = parseSource('div(:class="active")');
      expect(errors).toHaveLength(0);
      const el = ast.children[0] as ElementNode;
      expect(el.attributes[0].bound).toBe(true);
    });

    test('boolean attribute', () => {
      const { ast, errors } = parseSource('input(disabled)');
      expect(errors).toHaveLength(0);
      const el = ast.children[0] as ElementNode;
      expect(el.attributes[0].name).toBe('disabled');
      expect(el.attributes[0].value).toBe(null);
    });

    test('bound shorthand', () => {
      const { ast, errors } = parseSource('div(:firstName)');
      expect(errors).toHaveLength(0);
      const el = ast.children[0] as ElementNode;
      expect(el.attributes[0].name).toBe('firstName');
      expect(el.attributes[0].value).toBe('firstName');
      expect(el.attributes[0].bound).toBe(true);
    });

    test('template literal', () => {
      const { ast, errors } = parseSource('div(:name=`${first} ${last}`)');
      expect(errors).toHaveLength(0);
      const el = ast.children[0] as ElementNode;
      expect(el.attributes[0].templateLiteral).toBe(true);
      expect(el.attributes[0].value).toBe('${first} ${last}');
    });
  });

  describe('text', () => {
    test('inline text', () => {
      const { ast, errors } = parseSource('p Hello world');
      expect(errors).toHaveLength(0);
      const el = ast.children[0] as ElementNode;
      expect(el.children).toHaveLength(1);
      const text = el.children[0] as TextNode;
      expect(text.type).toBe('Text');
      expect(text.value).toBe('Hello world');
    });

    test('pipe text as child', () => {
      const { ast, errors } = parseSource('div\n  | Hello');
      expect(errors).toHaveLength(0);
      const el = ast.children[0] as ElementNode;
      expect(el.children).toHaveLength(1);
      const text = el.children[0] as TextNode;
      expect(text.value).toBe('Hello');
    });

    test('mixed text and elements', () => {
      const { ast, errors } = parseSource('div\n  | Hello\n  span World');
      expect(errors).toHaveLength(0);
      const div = ast.children[0] as ElementNode;
      expect(div.children).toHaveLength(2);
      expect(div.children[0].type).toBe('Text');
      expect(div.children[1].type).toBe('Element');
    });
  });

  describe('comments', () => {
    test('silent comment', () => {
      const { ast, errors } = parseSource('// hidden');
      expect(errors).toHaveLength(0);
      expect(ast.children).toHaveLength(1);
      const comment = ast.children[0] as CommentNode;
      expect(comment.type).toBe('Comment');
      expect(comment.value).toBe('hidden');
    });

    test('html comment', () => {
      const { ast, errors } = parseSource('//! visible');
      expect(errors).toHaveLength(0);
      const comment = ast.children[0] as HtmlCommentNode;
      expect(comment.type).toBe('HtmlComment');
      expect(comment.value).toBe('visible');
    });
  });

  describe('block expansion', () => {
    test('child expansion', () => {
      const { ast, errors } = parseSource('li > a Home');
      expect(errors).toHaveLength(0);
      const li = ast.children[0] as ElementNode;
      expect(li.tagName).toBe('li');
      expect(li.children).toHaveLength(1);
      const a = li.children[0] as ElementNode;
      expect(a.tagName).toBe('a');
      expect(a.children).toHaveLength(1);
      expect((a.children[0] as TextNode).value).toBe('Home');
    });
  });

  describe('content mode', () => {
    test('element with content mode', () => {
      const { ast, errors } = parseSource('div:md\n  # Hello');
      expect(errors).toHaveLength(0);
      const el = ast.children[0] as ElementNode;
      expect(el.contentMode).toBe('md');
    });

    test('standalone content block', () => {
      const { ast, errors } = parseSource(':md\n  # Title');
      expect(errors).toHaveLength(0);
      expect(ast.children).toHaveLength(1);
      const block = ast.children[0] as ContentBlockNode;
      expect(block.type).toBe('ContentBlock');
      expect(block.mode).toBe('md');
      expect(block.body).toBe('# Title');
    });
  });

  describe('control flow blocks', () => {
    test('simple if block', () => {
      const { ast, errors } = parseSource('{#if cond}\n  p Hello');
      expect(errors).toHaveLength(0);
      expect(ast.children).toHaveLength(1);
      const block = ast.children[0] as BlockNode;
      expect(block.type).toBe('Block');
      expect(block.blockType).toBe('if');
      expect(block.expression).toBe('cond');
      expect(block.clauses).toHaveLength(1);
      expect(block.clauses[0].children).toHaveLength(1);
      expect((block.clauses[0].children[0] as ElementNode).tagName).toBe('p');
    });

    test('if/else block', () => {
      const { ast, errors } = parseSource('{#if cond}\n  p Hello\n{:else}\n  p Bye');
      expect(errors).toHaveLength(0);
      const block = ast.children[0] as BlockNode;
      expect(block.clauses).toHaveLength(2);
      expect(block.clauses[0].clauseType).toBe(null);
      expect(block.clauses[1].clauseType).toBe('else');
      expect(block.clauses[1].children).toHaveLength(1);
    });

    test('if/else-if/else block', () => {
      const { ast, errors } = parseSource('{#if a}\n  p A\n{:else if b}\n  p B\n{:else}\n  p C');
      expect(errors).toHaveLength(0);
      const block = ast.children[0] as BlockNode;
      expect(block.clauses).toHaveLength(3);
      expect(block.clauses[1].clauseType).toBe('else if');
      expect(block.clauses[1].expression).toBe('b');
      expect(block.clauses[2].clauseType).toBe('else');
    });

    test('each block', () => {
      const { ast, errors } = parseSource('{#each items as item}\n  li {item.name}');
      expect(errors).toHaveLength(0);
      const block = ast.children[0] as BlockNode;
      expect(block.blockType).toBe('each');
      expect(block.expression).toBe('items as item');
    });

    test('inline directive', () => {
      const { ast, errors } = parseSource('{@render header()}');
      expect(errors).toHaveLength(0);
      expect(ast.children).toHaveLength(1);
      const dir = ast.children[0] as InlineDirectiveNode;
      expect(dir.type).toBe('InlineDirective');
      expect(dir.directiveType).toBe('render');
      expect(dir.expression).toBe('header()');
    });

    test('block inside element', () => {
      const { ast, errors } = parseSource('div\n  {#if cond}\n    p Hello');
      expect(errors).toHaveLength(0);
      const div = ast.children[0] as ElementNode;
      expect(div.children).toHaveLength(1);
      const block = div.children[0] as BlockNode;
      expect(block.type).toBe('Block');
      expect(block.blockType).toBe('if');
    });

    test('element inside block', () => {
      const { ast, errors } = parseSource('{#if cond}\n  div\n    p Hello');
      expect(errors).toHaveLength(0);
      const block = ast.children[0] as BlockNode;
      const div = block.clauses[0].children[0] as ElementNode;
      expect(div.tagName).toBe('div');
      expect((div.children[0] as ElementNode).tagName).toBe('p');
    });

    test('nested blocks', () => {
      const { ast, errors } = parseSource('{#if a}\n  {#each items as item}\n    li {item}');
      expect(errors).toHaveLength(0);
      const outer = ast.children[0] as BlockNode;
      expect(outer.blockType).toBe('if');
      const inner = outer.clauses[0].children[0] as BlockNode;
      expect(inner.blockType).toBe('each');
    });

    test('empty block', () => {
      const { ast, errors } = parseSource('{#if cond}');
      expect(errors).toHaveLength(0);
      const block = ast.children[0] as BlockNode;
      expect(block.clauses[0].children).toHaveLength(0);
    });
  });

  describe('error recovery', () => {
    test('void element with children produces warning', () => {
      const { ast, errors } = parseSource('br\n  span oops');
      expect(errors.length).toBeGreaterThan(0);
      // Should still parse
      const br = ast.children[0] as ElementNode;
      expect(br.tagName).toBe('br');
    });
  });
});
