import { describe, test, expect } from 'vitest';
import { compile, compileAst, parse, compileToHtml } from '../src/index.js';
import type { SourceMapping } from '../src/index.js';

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

    test('directive attribute without value', () => {
      const { html } = compile('Comp(client:load)');
      expect(html.trim()).toBe('<Comp client:load></Comp>');
    });

    test('directive attribute with value', () => {
      const { html } = compile('Comp(client:only="vue")');
      expect(html.trim()).toBe('<Comp client:only="vue"></Comp>');
    });

    test('expression attribute value', () => {
      const { html } = compile('Code(code={EXAMPLE})');
      expect(html.trim()).toBe('<Code code={EXAMPLE}></Code>');
    });

    test('bound attribute with expression value', () => {
      const { html } = compile('div(:class={a + b})');
      expect(html.trim()).toBe('<div :class={a + b}></div>');
    });

    test('expression with nested braces', () => {
      const { html } = compile('Code(code={items.map(i => fn(i))})');
      expect(html.trim()).toBe('<Code code={items.map(i => fn(i))}></Code>');
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

    test('blank line after comment is not absorbed', () => {
      const input = dedent`
        // comment

        p Hello
      `;
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe('<p>Hello</p>');
    });

    test('blank line after comment with siblings', () => {
      const input = dedent`
        div
          // comment

          p Hello
      `;
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html).toContain('<p>Hello</p>');
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
    test('child expansion', () => {
      const { html, errors } = compile('li > a(href="/") Home');
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

  describe('control flow - svelte', () => {
    test('simple if block', () => {
      const input = dedent`
        @if(loggedIn)
          p Welcome
      `;
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe(dedent`
        {#if loggedIn}
          <p>Welcome</p>
        {/if}
      `.trim());
    });

    test('if/else block', () => {
      const input = dedent`
        @if(loggedIn)
          p Welcome
        @else
          p Please log in
      `;
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe(dedent`
        {#if loggedIn}
          <p>Welcome</p>
        {:else}
          <p>Please log in</p>
        {/if}
      `.trim());
    });

    test('if/else-if/else block', () => {
      const input = dedent`
        @if(a)
          p A
        @elseif(b)
          p B
        @else
          p C
      `;
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe(dedent`
        {#if a}
          <p>A</p>
        {:else if b}
          <p>B</p>
        {:else}
          <p>C</p>
        {/if}
      `.trim());
    });

    test('each block', () => {
      const input = dedent`
        @each(items as item, i)
          li {item.name}
      `;
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe(dedent`
        {#each items as item, i}
          <li>{item.name}</li>
        {/each}
      `.trim());
    });

    test('nested blocks', () => {
      const input = dedent`
        @if(items.length)
          @each(items as item)
            li {item}
      `;
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe(dedent`
        {#if items.length}
          {#each items as item}
            <li>{item}</li>
          {/each}
        {/if}
      `.trim());
    });

    test('inline directive @render', () => {
      const { html, errors } = compile('{@render header()}');
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe('{@render header()}');
    });

    test('inline directive @html', () => {
      const { html, errors } = compile('{@html rawContent}');
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe('{@html rawContent}');
    });

    test('block inside element', () => {
      const input = dedent`
        div
          @if(cond)
            p Hello
      `;
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe(dedent`
        <div>
          {#if cond}
            <p>Hello</p>
          {/if}
        </div>
      `.trim());
    });
  });

  describe('control flow - astro', () => {
    test('if without else uses &&', () => {
      const input = dedent`
        @if(loggedIn)
          p Welcome
      `;
      const { html, errors } = compile(input, { framework: 'astro' });
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe(dedent`
        {loggedIn && (
          <p>Welcome</p>
        )}
      `.trim());
    });

    test('if/else uses ternary', () => {
      const input = dedent`
        @if(loggedIn)
          p Welcome
        @else
          p Please log in
      `;
      const { html, errors } = compile(input, { framework: 'astro' });
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe(dedent`
        {loggedIn ? (
          <p>Welcome</p>
        ) : (
          <p>Please log in</p>
        )}
      `.trim());
    });

    test('if/else-if/else uses nested ternary', () => {
      const input = dedent`
        @if(a)
          p A
        @elseif(b)
          p B
        @else
          p C
      `;
      const { html, errors } = compile(input, { framework: 'astro' });
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe(dedent`
        {a ? (
          <p>A</p>
        ) : b ? (
          <p>B</p>
        ) : (
          <p>C</p>
        )}
      `.trim());
    });

    test('each uses .map()', () => {
      const input = dedent`
        @each(items as item)
          li {item.name}
      `;
      const { html, errors } = compile(input, { framework: 'astro' });
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe(dedent`
        {items.map((item) => (
          <li>{item.name}</li>
        ))}
      `.trim());
    });

    test('each with index uses .map()', () => {
      const input = dedent`
        @each(items as item, i)
          li {item.name}
      `;
      const { html, errors } = compile(input, { framework: 'astro' });
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe(dedent`
        {items.map((item, i) => (
          <li>{item.name}</li>
        ))}
      `.trim());
    });

    test('@html uses Fragment set:html', () => {
      const { html, errors } = compile('{@html rawContent}', { framework: 'astro' });
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe('<Fragment set:html={rawContent} />');
    });
  });

  describe('raw HTML passthrough', () => {
    test('doctype passes through', () => {
      const input = dedent`
        <!DOCTYPE html>
        html
          head
            title Hello
      `;
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html>');
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

  describe('position tracking', () => {
    test('tracks element positions', () => {
      const input = 'div';
      const result = compile(input);
      expect(result.mappings).toBeDefined();
      expect(result.mappings.length).toBeGreaterThan(0);

      // Find mapping for the div element
      const divMapping = result.mappings.find(m =>
        m.metadata?.nodeType === 'Element' &&
        result.html.substring(m.generatedSpan.start.offset, m.generatedSpan.end.offset).includes('div')
      );
      expect(divMapping).toBeDefined();
    });

    test('tracks attribute positions', () => {
      const input = 'div(id="test" class="foo")';
      const result = compile(input);

      // Find mapping for id attribute
      const idMapping = result.mappings.find(m =>
        m.metadata?.nodeType === 'Attribute' &&
        m.metadata?.attributeName === 'id'
      );
      expect(idMapping).toBeDefined();

      // Find mapping for class attribute
      const classMapping = result.mappings.find(m =>
        m.metadata?.nodeType === 'Attribute' &&
        m.metadata?.attributeName === 'class'
      );
      expect(classMapping).toBeDefined();
    });

    test('tracks text node positions', () => {
      const input = 'p Hello world';
      const result = compile(input);

      // Find mapping for text node
      const textMapping = result.mappings.find(m =>
        m.metadata?.nodeType === 'Text'
      );
      expect(textMapping).toBeDefined();

      const mappedText = result.html.substring(
        textMapping!.generatedSpan.start.offset,
        textMapping!.generatedSpan.end.offset
      );
      expect(mappedText).toBe('Hello world');
    });

    test('tracks nested element positions', () => {
      const input = dedent`
        div
          p Hello
          span World
      `;
      const result = compile(input);

      // Should have mappings for all elements
      const elementMappings = result.mappings.filter(m =>
        m.metadata?.nodeType === 'Element'
      );

      // Each element has tag name mappings (open + close = 2 per element, 3 elements = 6)
      expect(elementMappings.length).toBeGreaterThanOrEqual(6);
    });

    test('omits mappings for silent comments', () => {
      const input = dedent`
        // This is a silent comment
        div
      `;
      const result = compile(input);

      // Should not have any Comment node mappings (only HtmlComment)
      const commentMappings = result.mappings.filter(m =>
        m.metadata?.nodeType === 'Comment'
      );
      expect(commentMappings).toHaveLength(0);
    });

    test('tracks HTML comment positions', () => {
      const input = '//! This is an HTML comment';
      const result = compile(input);

      const htmlCommentMappings = result.mappings.filter(m =>
        m.metadata?.nodeType === 'HtmlComment'
      );
      expect(htmlCommentMappings.length).toBeGreaterThan(0);
    });

    test('tracks control flow block positions', () => {
      const input = dedent`
        @if(condition)
          p True
      `;
      const result = compile(input);

      const blockMappings = result.mappings.filter(m =>
        m.metadata?.nodeType === 'Block'
      );
      expect(blockMappings.length).toBeGreaterThan(0);
    });

    test('backward compatibility with compileToHtml', () => {
      const input = 'div Hello';
      const oldResult = compileToHtml(input);
      const newResult = compile(input);

      // compileToHtml should return same html and errors
      expect(oldResult.html).toBe(newResult.html);
      expect(oldResult.errors).toEqual(newResult.errors);
    });

    test('mappings are sorted and non-overlapping', () => {
      const input = dedent`
        div#main.container
          p Hello
          span World
      `;
      const result = compile(input);

      // Sort mappings by generated position
      const sortedMappings = [...result.mappings].sort((a, b) =>
        a.generatedSpan.start.offset - b.generatedSpan.start.offset
      );

      // Check that mappings don't overlap
      for (let i = 0; i < sortedMappings.length - 1; i++) {
        const current = sortedMappings[i];
        const next = sortedMappings[i + 1];
        expect(current.generatedSpan.end.offset).toBeLessThanOrEqual(
          next.generatedSpan.start.offset
        );
      }
    });
  });
});
