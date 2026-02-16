import { describe, test, expect } from 'vitest';
import { compile, compileAst, parse } from '../src/index.js';

function dedent(strings: TemplateStringsArray, ...values: unknown[]): string {
  let result = String.raw(strings, ...values);
  // Remove leading newline
  result = result.replace(/^\n/, '');
  // Find minimum indentation
  const lines = result.split('\n');
  const minIndent = lines
    .filter(l => l.trim().length > 0)
    .reduce((min, l) => {
      const indent = l.match(/^(\s*)/)?.[1].length ?? 0;
      return Math.min(min, indent);
    }, Infinity);
  // Remove common indentation
  return lines.map(l => l.slice(minIndent)).join('\n').trimEnd();
}

describe('Compiler', () => {
  describe('basic elements', () => {
    test('single element', () => {
      const { html, errors } = compile('div');
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe('<div></div>');
    });

    test('element with inline text', () => {
      const { html, errors } = compile('p Hello world');
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe('<p>Hello world</p>');
    });

    test('nested elements', () => {
      const input = dedent`
        div
          p Hello
          span World
      `;
      const expected = dedent`
        <div>
          <p>Hello</p>
          <span>World</span>
        </div>
      `;
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe(expected.trim());
    });

    test('deeply nested', () => {
      const input = dedent`
        div
          p
            span Hello
      `;
      const expected = dedent`
        <div>
          <p>
            <span>Hello</span>
          </p>
        </div>
      `;
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe(expected.trim());
    });
  });

  describe('CSS shorthand', () => {
    test('id', () => {
      const { html } = compile('div#app');
      expect(html.trim()).toBe('<div id="app"></div>');
    });

    test('classes', () => {
      const { html } = compile('div.foo.bar');
      expect(html.trim()).toBe('<div class="foo bar"></div>');
    });

    test('id and classes', () => {
      const { html } = compile('div#app.main.container');
      expect(html.trim()).toBe('<div id="app" class="main container"></div>');
    });

    test('implicit div', () => {
      const { html } = compile('#app');
      expect(html.trim()).toBe('<div id="app"></div>');
    });

    test('implicit div with class', () => {
      const { html } = compile('.container');
      expect(html.trim()).toBe('<div class="container"></div>');
    });
  });

  describe('attributes', () => {
    test('static attribute', () => {
      const { html } = compile('div(class="foo")');
      expect(html.trim()).toBe('<div class="foo"></div>');
    });

    test('boolean attribute', () => {
      const { html } = compile('input(disabled)');
      expect(html.trim()).toBe('<input disabled>');
    });

    test('bound attribute', () => {
      const { html } = compile('div(:class="active")');
      expect(html.trim()).toBe('<div :class="active"></div>');
    });

    test('template literal attribute', () => {
      const { html } = compile('div(:name=`${first} ${last}`)');
      expect(html.trim()).toBe('<div :name="`${first} ${last}`"></div>');
    });

    test('multiple attributes', () => {
      const { html } = compile('a(href="/" target="_blank")');
      expect(html.trim()).toBe('<a href="/" target="_blank"></a>');
    });
  });

  describe('class merging', () => {
    test('CSS shorthand + static class attr', () => {
      const { html } = compile('div.foo(class="bar baz")');
      expect(html.trim()).toBe('<div class="foo bar baz"></div>');
    });

    test('CSS shorthand + bound class kept separate', () => {
      const { html } = compile('div.foo(:class="active")');
      expect(html.trim()).toBe('<div class="foo" :class="active"></div>');
    });
  });

  describe('void elements', () => {
    test('no closing tag', () => {
      const { html } = compile('br');
      expect(html.trim()).toBe('<br>');
    });

    test('void element with attributes', () => {
      const { html } = compile('img(src="/pic.jpg" alt="photo")');
      expect(html.trim()).toBe('<img src="/pic.jpg" alt="photo">');
    });

    test('xhtml self-closing', () => {
      const { html } = compile('br', { xhtml: true });
      expect(html.trim()).toBe('<br />');
    });
  });

  describe('comments', () => {
    test('silent comments omitted', () => {
      const input = dedent`
        div
          // hidden comment
          p Hello
      `;
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html).not.toContain('hidden');
      expect(html).toContain('<p>Hello</p>');
    });

    test('html comments rendered', () => {
      const { html, errors } = compile('//! visible comment');
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe('<!-- visible comment -->');
    });
  });

  describe('text', () => {
    test('pipe text', () => {
      const input = dedent`
        p
          | Hello
          | World
      `;
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html).toContain('Hello');
      expect(html).toContain('World');
    });

    test('trailing backslash preserves whitespace', () => {
      const { html } = compile('p Hello \\');
      expect(html.trim()).toBe('<p>Hello  </p>');
    });

    test('inline html in text passes through', () => {
      const { html } = compile('p Click <a href="/">here</a>');
      expect(html.trim()).toBe('<p>Click <a href="/">here</a></p>');
    });
  });

  describe('block expansion', () => {
    test('colon child', () => {
      const { html, errors } = compile('li: a(href="/") Home');
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe('<li><a href="/">Home</a></li>');
    });
  });

  describe('content mode', () => {
    test('text content mode', () => {
      const input = dedent`
        script:
          console.log("hello");
      `;
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html).toContain('console.log("hello");');
    });

    test('filter with handler', () => {
      const input = dedent`
        div:md
          # Hello
      `;
      const { html, errors } = compile(input, {
        filters: {
          md: (body: string) => `<h1>${body.replace('# ', '')}</h1>`,
        },
      });
      expect(errors).toHaveLength(0);
      expect(html).toContain('<h1>Hello</h1>');
    });
  });

  describe('compiler options', () => {
    test('minified output (indent=0)', () => {
      const input = dedent`
        div
          p Hello
      `;
      const { html } = compile(input, { indent: 0 });
      expect(html).not.toContain('  ');
    });
  });
});
