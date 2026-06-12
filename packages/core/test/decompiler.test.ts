import { describe, test, expect } from 'vitest';
import { compile, decompile } from '../src/index.js';

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

/** Round-trip test: NMBL → HTML → decompile → compile again → same HTML */
function roundTrip(nmbl: string) {
  const { html: html1, errors } = compile(nmbl);
  expect(errors).toHaveLength(0);
  const decompiled = decompile(html1);
  const { html: html2, errors: errors2 } = compile(decompiled);
  expect(errors2).toHaveLength(0);
  expect(html2.trim()).toBe(html1.trim());
}

describe('Decompiler', () => {
  describe('basic elements', () => {
    test('single element', () => {
      const nmbl = decompile('<div></div>');
      expect(nmbl.trim()).toBe('div');
    });

    test('element with text', () => {
      const nmbl = decompile('<p>Hello world</p>');
      expect(nmbl.trim()).toBe('p Hello world');
    });

    test('void element', () => {
      const nmbl = decompile('<br>');
      expect(nmbl.trim()).toBe('br');
    });

    test('void element with attributes', () => {
      const nmbl = decompile('<input type="text" disabled>');
      expect(nmbl.trim()).toBe('input(type="text" disabled)');
    });
  });

  describe('CSS shorthand', () => {
    test('id extraction', () => {
      const nmbl = decompile('<div id="app"></div>');
      expect(nmbl.trim()).toBe('#app');
    });

    test('class extraction', () => {
      const nmbl = decompile('<div class="foo bar"></div>');
      expect(nmbl.trim()).toBe('.foo.bar');
    });

    test('id and classes on div (implicit)', () => {
      const nmbl = decompile('<div id="app" class="main container"></div>');
      expect(nmbl.trim()).toBe('#app.main.container');
    });

    test('id and classes on non-div', () => {
      const nmbl = decompile('<section id="hero" class="dark"></section>');
      expect(nmbl.trim()).toBe('section#hero.dark');
    });

    test('class on non-div', () => {
      const nmbl = decompile('<section class="hero"></section>');
      expect(nmbl.trim()).toBe('section.hero');
    });
  });

  describe('nesting', () => {
    test('nested elements', () => {
      const html = '<div><p>Hello</p><span>World</span></div>';
      const expected = dedent`
        div
          p Hello
          span World
      `;
      expect(decompile(html).trim()).toBe(expected.trim());
    });

    test('deeply nested (inline HTML)', () => {
      const html = '<div><p><span>Hello</span></p></div>';
      // Inline HTML → chained block expansion
      expect(decompile(html).trim()).toBe('div > p > span Hello');
    });

    test('deeply nested (formatted HTML)', () => {
      const html = '<div>\n  <p>\n    <span>Hello</span>\n  </p>\n</div>';
      const expected = dedent`
        div
          p
            span Hello
      `;
      expect(decompile(html).trim()).toBe(expected.trim());
    });
  });

  describe('block expansion', () => {
    test('single element child inlined', () => {
      const html = '<li><a href="/">Home</a></li>';
      expect(decompile(html).trim()).toBe('li > a(href="/") Home');
    });

    test('navigation structure', () => {
      const html = dedent`
        <nav>
          <ul>
            <li><a href="/">Home</a></li>
            <li><a href="/about">About</a></li>
          </ul>
        </nav>
      `;
      const expected = dedent`
        nav
          ul
            li > a(href="/") Home
            li > a(href="/about") About
      `;
      expect(decompile(html).trim()).toBe(expected.trim());
    });
  });

  describe('comments', () => {
    test('HTML comments', () => {
      const nmbl = decompile('<!-- hello -->');
      expect(nmbl.trim()).toBe('//! hello');
    });
  });

  describe('attributes', () => {
    test('boolean attribute', () => {
      const nmbl = decompile('<input disabled>');
      expect(nmbl.trim()).toBe('input(disabled)');
    });

    test('multiple attributes', () => {
      const nmbl = decompile('<a href="/" target="_blank"></a>');
      expect(nmbl.trim()).toBe('a(href="/" target="_blank")');
    });

    test('mixed attributes with id and class', () => {
      const nmbl = decompile('<form id="login" class="form" action="/submit" method="post"></form>');
      expect(nmbl.trim()).toBe('form#login.form(action="/submit" method="post")');
    });
  });

  describe('mixed inline content', () => {
    test('text with inline element', () => {
      const html = '<p>Click <a href="/">here</a> to continue</p>';
      const nmbl = decompile(html);
      expect(nmbl.trim()).toBe('p Click <a href="/">here</a> to continue');
    });
  });

  describe('round-trip tests', () => {
    test('simple page structure', () => {
      roundTrip(dedent`
        html
          head
            title My Page
          body
            h1 Hello World
            p This is a paragraph
      `);
    });

    test('implicit divs', () => {
      roundTrip(dedent`
        #app
          .header
            h1 Title
          .content
            p Body
      `);
    });

    test('navigation with block expansion', () => {
      roundTrip(dedent`
        nav
          ul
            li > a(href="/") Home
            li > a(href="/about") About
            li > a(href="/contact") Contact
      `);
    });

    test('void elements', () => {
      roundTrip('br');
      roundTrip('img(src="/pic.jpg" alt="photo")');
      roundTrip('input(type="text" name="email" required)');
    });

    test('element with classes', () => {
      roundTrip('section.hero.dark');
    });

    test('form structure', () => {
      roundTrip(dedent`
        form(action="/submit" method="post")
          input(type="text" name="email" required)
          input(type="password" name="pass")
          button(type="submit") Sign In
      `);
    });

    test('comments', () => {
      roundTrip('//! visible comment');
    });

    test('inline html passthrough', () => {
      roundTrip('p Click <a href="/">here</a> to continue');
    });

    test('nested with text', () => {
      roundTrip(dedent`
        div
          p Hello
          span World
      `);
    });
  });
});
