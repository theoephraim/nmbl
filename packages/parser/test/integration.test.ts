import { describe, test, expect } from 'vitest';
import { compile, tokenize, parse } from '../src/index.js';

function dedent(strings: TemplateStringsArray, ...values: unknown[]): string {
  let result = String.raw(strings, ...values);
  result = result.replace(/^\n/, '');
  const lines = result.split('\n');
  const minIndent = lines
    .filter(l => l.trim().length > 0)
    .reduce((min, l) => {
      const indent = l.match(/^(\s*)/)?.[1].length ?? 0;
      return Math.min(min, indent);
    }, Infinity);
  return lines.map(l => l.slice(minIndent)).join('\n').trimEnd();
}

describe('Integration', () => {
  describe('full pipeline', () => {
    test('simple page structure', () => {
      const input = dedent`
        html
          head
            title My Page
          body
            h1 Hello World
            p This is a paragraph
      `;
      const expected = dedent`
        <html>
          <head>
            <title>My Page</title>
          </head>
          <body>
            <h1>Hello World</h1>
            <p>This is a paragraph</p>
          </body>
        </html>
      `;
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe(expected.trim());
    });

    test('component with all features', () => {
      const input = dedent`
        MyComponent#hero.dark.rounded(:title="pageTitle" disabled)
          p Content here
      `;
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html).toContain('id="hero"');
      expect(html).toContain('class="dark rounded"');
      expect(html).toContain(':title="pageTitle"');
      expect(html).toContain('disabled');
      expect(html).toContain('<p>Content here</p>');
    });

    test('navigation with block expansion', () => {
      const input = dedent`
        nav
          ul
            li: a(href="/") Home
            li: a(href="/about") About
            li: a(href="/contact") Contact
      `;
      const expected = dedent`
        <nav>
          <ul>
            <li><a href="/">Home</a></li>
            <li><a href="/about">About</a></li>
            <li><a href="/contact">Contact</a></li>
          </ul>
        </nav>
      `;
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe(expected.trim());
    });

    test('mixed content with text and elements', () => {
      const input = dedent`
        div
          | Some text before
          p A paragraph
          | Some text after
      `;
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html).toContain('Some text before');
      expect(html).toContain('<p>A paragraph</p>');
      expect(html).toContain('Some text after');
    });

    test('form with various attribute types', () => {
      const input = dedent`
        form(action="/submit" method="post")
          input(type="text" name="email" :value="email" required)
          input(type="password" name="pass")
          button(type="submit") Sign In
      `;
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html).toContain('action="/submit"');
      expect(html).toContain(':value="email"');
      expect(html).toContain('required');
      expect(html).toContain('<button type="submit">Sign In</button>');
    });

    test('comments mixed with elements', () => {
      const input = dedent`
        div
          // This should not appear
          p Visible
          //! This should appear as HTML comment
      `;
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html).not.toContain('should not appear');
      expect(html).toContain('<p>Visible</p>');
      expect(html).toContain('<!-- This should appear as HTML comment -->');
    });

    test('implicit divs', () => {
      const input = dedent`
        #app
          .header
            h1 Title
          .content
            p Body
          .footer
            | Copyright
      `;
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html).toContain('<div id="app">');
      expect(html).toContain('<div class="header">');
      expect(html).toContain('<div class="content">');
      expect(html).toContain('<div class="footer">');
    });

    test('bound shorthand expansion', () => {
      const input = 'MyInput(:firstName :lastName)';
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html).toContain(':firstName="firstName"');
      expect(html).toContain(':lastName="lastName"');
    });

    test('template literal in attribute', () => {
      const input = 'div(:class=`${base}-${variant}`)';
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html).toContain(':class="`${base}-${variant}`"');
    });

    test('inline html passthrough', () => {
      const input = 'p Click <a href="/">here</a> to continue';
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe('<p>Click <a href="/">here</a> to continue</p>');
    });
  });

  describe('tokenize API', () => {
    test('returns tokens and errors', () => {
      const { tokens, errors } = tokenize('div.foo');
      expect(errors).toHaveLength(0);
      expect(tokens.length).toBeGreaterThan(0);
    });
  });

  describe('parse API', () => {
    test('returns AST and errors', () => {
      const { ast, errors } = parse('div\n  p Hello');
      expect(errors).toHaveLength(0);
      expect(ast.type).toBe('Document');
      expect(ast.children.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    test('returns errors non-fatally', () => {
      const { html, errors } = compile('div(class="unterminated');
      expect(errors.length).toBeGreaterThan(0);
      // Should still produce some output
      expect(html).toBeDefined();
    });
  });
});
