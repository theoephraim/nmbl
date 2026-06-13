import { describe, test, expect } from 'vitest';
import { compile, compileToHtml } from '../src/index.js';

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

    test('implicit div with chained classes', () => {
      const { html } = compile('.box.foo hi');
      expect(html.trim()).toBe('<div class="box foo">hi</div>');
    });
  });

  // Selectors and attribute lists must be GLUED (no whitespace) to the tag head.
  // A space breaks the head, so what follows is text — `div .card` is the tag
  // `div` with the text `.card`, not a div with a class. (Enforced by the
  // `adjacent` grammar assertion.)
  describe('selector/attr gluing', () => {
    test('spaced class is text, not a class', () => {
      const { html } = compile('div .card x');
      expect(html.trim()).toBe('<div>.card x</div>');
    });

    test('glued class still binds', () => {
      const { html } = compile('div.card x');
      expect(html.trim()).toBe('<div class="card">x</div>');
    });

    test('partially-spaced classes: only the glued ones bind', () => {
      const { html } = compile('div.card .dark x');
      expect(html.trim()).toBe('<div class="card">.dark x</div>');
    });

    test('spaced id is text, not an id', () => {
      const { html } = compile('div #app x');
      expect(html.trim()).toBe('<div>#app x</div>');
    });

    test('spaced paren is text, not an attribute list', () => {
      const { html } = compile('h3 (Almost) Nothing to learn');
      expect(html.trim()).toBe('<h3>(Almost) Nothing to learn</h3>');
    });

    test('glued attribute list still binds', () => {
      const { html } = compile('h3(data-x="1") Title');
      expect(html.trim()).toBe('<h3 data-x="1">Title</h3>');
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

  describe('blank-line preservation', () => {
    test('a blank line between siblings is kept (collapsed to one)', () => {
      const input = 'div.a\n  p one\n\n\nsection.b\n  p two';
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html).toContain('</div>\n\n<section');
      expect(html).not.toContain('</div>\n\n\n<section');
    });

    test('no blank line in source → none in output (gap measured from the subtree end)', () => {
      const input = 'html\n  head\n    title T\n  body\n    p x';
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html).toContain('</head>\n  <body>');
    });

    test('a stripped // comment between siblings leaves no gap', () => {
      const input = 'p one\n// note\np two';
      const { html, errors } = compile(input);
      expect(errors).toHaveLength(0);
      expect(html).toContain('<p>one</p>\n<p>two</p>');
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

    test('jsx: element content block compiles to dangerouslySetInnerHTML', () => {
      const input = dedent`
        div.prose:md
          # Hello
      `;
      const { html, errors } = compile(input, {
        framework: 'jsx',
        filters: { md: (body: string) => `<h1>${body.replace('# ', '')}</h1>` },
      });
      expect(errors).toHaveLength(0);
      // Raw HTML is not JSX (braces become expressions, unclosed tags become
      // elements) — the body must land in dangerouslySetInnerHTML.
      expect(html).toContain('dangerouslySetInnerHTML={{ __html: "<h1>Hello</h1>" }}');
      expect(html).not.toContain('<h1>Hello</h1></div>');
    });

    test('jsx: script content block also uses dangerouslySetInnerHTML', () => {
      const input = dedent`
        script:
          if (a) { b(); }
      `;
      const { html, errors } = compile(input, { framework: 'jsx' });
      expect(errors).toHaveLength(0);
      expect(html).toContain('<script dangerouslySetInnerHTML=');
      expect(html).toContain('if (a) { b(); }');
    });

    test('jsx: bare content block is a compile error with a hint', () => {
      const input = dedent`
        :md
          # Hello
      `;
      const { errors } = compile(input, { framework: 'jsx' });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('attach it to an element');
    });
  });

  describe('markdown filter (@nmbl-lang/core/markdown)', async () => {
    const { mdFilter, escapeCodeBraces } = await import('../src/markdown.js');

    test('renders markdown with GFM and passes raw inline HTML through', () => {
      const out = mdFilter('### Hi\n\nA [link](/x), **bold**, and <a target="_blank" href="/y">raw</a>.\n\n- ~~done~~\n');
      expect(out).toContain('<h3>Hi</h3>');
      expect(out).toContain('<a href="/x">link</a>');
      expect(out).toContain('<strong>bold</strong>');
      expect(out).toContain('<a target="_blank" href="/y">raw</a>');
      expect(out).toContain('<del>done</del>'); // gfm strikethrough
    });

    test('escapes braces inside code spans and fences (host frameworks parse { } as expressions)', () => {
      const out = mdFilter('Write `{#each x}` or:\n\n```\nif (a) { b(); }\n```\n');
      expect(out).not.toMatch(/<code[^>]*>[^<]*\{/);
      expect(out).toContain('&#123;#each x&#125;');
      expect(out).toContain('if (a) &#123; b(); &#125;');
    });

    test('works as a compile() filter end to end', () => {
      const { html, errors } = compile('div.prose:md\n  Some `{x}` code.', { filters: { md: mdFilter } });
      expect(errors).toHaveLength(0);
      // generated markup is indented into its parent, on its own lines
      expect(html).toBe('<div class="prose">\n  <p>Some <code>&#123;x&#125;</code> code.</p>\n</div>');
    });

    test('the generated markdown block is indented to the parent depth', () => {
      const { html } = compile('section\n  article:md\n    # Title\n\n    A para.', { filters: { md: mdFilter } });
      expect(html).toContain('\n  <article>\n    <h1>Title</h1>\n    <p>A para.</p>\n  </article>');
    });

    test('content inside a fenced code block (<pre>) is not re-indented', () => {
      const { html } = compile('div\n  article:md\n    ```\n    a\n      b\n    ```', { filters: { md: mdFilter } });
      // the inner lines keep their own indentation, no parent indent prefix
      expect(html).toContain('<pre><code>a\n  b\n</code></pre>');
    });

    test('block markup nests: <li> sits one level under <ul>', () => {
      const { html } = compile('article:md\n  - one\n    - nested\n  - two', { filters: { md: mdFilter } });
      expect(html).toContain('<article>\n  <ul>\n    <li>\n      one\n      <ul>\n        <li>nested</li>\n      </ul>\n    </li>\n    <li>two</li>\n  </ul>\n</article>');
    });

    test('escapeCodeBraces leaves braces outside code elements alone', () => {
      expect(escapeCodeBraces('<p>{expr}</p><code>{x}</code>')).toBe('<p>{expr}</p><code>&#123;x&#125;</code>');
    });
  });

  describe('control flow - svelte', () => {
    test('simple if block', () => {
      const input = dedent`
        @if(loggedIn)
          p Welcome
      `;
      const { html, errors } = compile(input, { framework: 'svelte' });
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
      const { html, errors } = compile(input, { framework: 'svelte' });
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
      const { html, errors } = compile(input, { framework: 'svelte' });
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
      const { html, errors } = compile(input, { framework: 'svelte' });
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
      const { html, errors } = compile(input, { framework: 'svelte' });
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
      const { html, errors } = compile('{@render header()}', { framework: 'svelte' });
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe('{@render header()}');
    });

    test('inline directive @html', () => {
      const { html, errors } = compile('{@html rawContent}', { framework: 'svelte' });
      expect(errors).toHaveLength(0);
      expect(html.trim()).toBe('{@html rawContent}');
    });

    test('block inside element', () => {
      const input = dedent`
        div
          @if(cond)
            p Hello
      `;
      const { html, errors } = compile(input, { framework: 'svelte' });
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

  describe('control flow - vue', () => {
    test('if/elseif/else compiles to <template> wrappers', () => {
      const input = dedent`
        @if(loggedIn)
          p Welcome
        @elseif(pending)
          p Wait
        @else
          p Log in
      `;
      const { html, errors } = compile(input, { framework: 'vue' });
      expect(errors).toHaveLength(0);
      expect(html).toContain('<template v-if="loggedIn">');
      expect(html).toContain('<template v-else-if="pending">');
      expect(html).toContain('<template v-else>');
      expect(html).toContain('<p>Welcome</p>');
      expect((html.match(/<\/template>/g) ?? []).length).toBe(3);
    });

    test('each with :key in the same parens (in normalizes to of)', () => {
      const { html, errors } = compile(
        '@each(item in items :key="item.id")\n  li {{ item.name }}',
        { framework: 'vue' },
      );
      expect(errors).toHaveLength(0);
      expect(html).toContain('<template v-for="item of items" :key="item.id">');
    });

    test('svelte-style as-form compiles in vue mode too', () => {
      const { html, errors } = compile(
        '@each(items as item, i (item.id))\n  li {{ item.name }}',
        { framework: 'vue' },
      );
      expect(errors).toHaveLength(0);
      expect(html).toContain('<template v-for="(item, i) of items" :key="item.id">');
    });

    test('a stray comma before the attr section is tolerated', () => {
      const { html, errors } = compile(
        '@each(item in items, :key="item.id")\n  li x',
        { framework: 'vue' },
      );
      expect(errors).toHaveLength(0);
      expect(html).toContain('<template v-for="item of items" :key="item.id">');
    });

    test('equality operators in expressions never split as attrs', () => {
      for (const expr of ['a === "b"', 'x == y', 'a <= b']) {
        const { html, errors } = compile(`@if(${expr})\n  p x`, { framework: 'vue' });
        expect(errors).toHaveLength(0);
        expect(html).toContain('<template v-if=');
      }
    });

    test(':key in svelte mode becomes the keyed-each parens', () => {
      const { html, errors } = compile('@each(items as item :key="item.id")\n  li x', { framework: 'svelte' });
      expect(errors).toHaveLength(0);
      expect(html).toContain('{#each items as item (item.id)}');
    });

    test('of-form compiles in svelte mode too', () => {
      const { html, errors } = compile('@each(item, i of items :key="item.id")\n  li x', { framework: 'svelte' });
      expect(errors).toHaveLength(0);
      expect(html).toContain('{#each items as item, i (item.id)}');
    });

    test('non-key wrapper attributes error outside vue mode', () => {
      const { errors } = compile('@each(items as item v-memo="[item]")\n  li x', { framework: 'svelte' });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('wrapper attributes');
    });

    test('doubled key (parens + :key) is an error', () => {
      const { errors } = compile('@each(items as item (item.id) :key="item.id")\n  li x', { framework: 'vue' });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('use one');
    });

    test('destructured v-for expression keeps its nested comma', () => {
      const { html, errors } = compile(
        '@each((item, i) in items :key="item.id")\n  li {{ i }}',
        { framework: 'vue' },
      );
      expect(errors).toHaveLength(0);
      expect(html).toContain('<template v-for="(item, i) of items" :key="item.id">');
    });

    test('double quotes in expressions are escaped', () => {
      const { html, errors } = compile('@if(x === "a")\n  p hi', { framework: 'vue' });
      expect(errors).toHaveLength(0);
      expect(html).toContain('v-if="x === &quot;a&quot;"');
    });

    test('@await/@key/@snippet are hard errors', () => {
      for (const block of ['@await(p)', '@key(x)', '@snippet(s())']) {
        const { errors } = compile(`${block}\n  p hi`, { framework: 'vue' });
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toContain("framework 'vue'");
      }
    });

    test('{@html} inline directive errors with a v-html hint', () => {
      const { errors } = compile('{@html rawContent}', { framework: 'vue' });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('v-html');
    });

    test('svelte each with index is not split by the attr rule', () => {
      const { html, errors } = compile('@each(items as item, i)\n  li {item.name}', { framework: 'svelte' });
      expect(errors).toHaveLength(0);
      expect(html).toContain('{#each items as item, i}');
    });
  });

  describe('framework - jsx', () => {
    const react = { framework: 'jsx' as const, attributeAliases: { class: 'className', for: 'htmlFor' } };

    test('class/for alias to className/htmlFor (react)', () => {
      const { html, errors } = compile('div#app.card\n  label(for="x") Name', react);
      expect(errors).toHaveLength(0);
      expect(html).toContain('className="card"');
      expect(html).toContain('htmlFor="x"');
      expect(html).toContain('id="app"');
    });

    test('class is preserved without aliases (solid/qwik)', () => {
      const { html, errors } = compile('div.card hi', { framework: 'jsx' });
      expect(errors).toHaveLength(0);
      expect(html).toContain('class="card"');
    });

    test('void elements self-close', () => {
      const { html } = compile('br', { framework: 'jsx' });
      expect(html.trim()).toBe('<br />');
    });

    test('@if/@else compiles to a ternary', () => {
      const { html, errors } = compile('@if(open)\n  p yes\n@else\n  p no', { framework: 'jsx' });
      expect(errors).toHaveLength(0);
      expect(html).toContain('{open ? (');
      expect(html).toContain(') : (');
    });

    test('@each :key lands on the iteration root element', () => {
      const { html, errors } = compile('@each(item of items :key="item.id")\n  li.row {item.name}', { framework: 'jsx' });
      expect(errors).toHaveLength(0);
      expect(html).toContain('{items.map((item) => (');
      expect(html).toContain('key={item.id}');
    });

    test('@each :key with multiple roots errors', () => {
      const { errors } = compile('@each(item of items :key="item.id")\n  li a\n  li b', { framework: 'jsx' });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('single root element');
    });

    test('rendered comments become brace comments', () => {
      const { html } = compile('//! note for output', { framework: 'jsx' });
      expect(html.trim()).toBe('{/* note for output */}');
    });

    test('expression attributes pass through unquoted', () => {
      const { html, errors } = compile('button(onClick={() => go(id)} disabled) Hit', { framework: 'jsx' });
      expect(errors).toHaveLength(0);
      expect(html).toContain('onClick={() => go(id)}');
      expect(html).toContain(' disabled>');
    });

    test('@await and {@html} are errors with hints', () => {
      expect(compile('@await(p)\n  p x', { framework: 'jsx' }).errors.length).toBeGreaterThan(0);
      const r = compile('{@html raw}', { framework: 'jsx' });
      expect(r.errors[0].message).toContain('dangerouslySetInnerHTML');
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
      const result = compile(input, { framework: 'svelte' });

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
