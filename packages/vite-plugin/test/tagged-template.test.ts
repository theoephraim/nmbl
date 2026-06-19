import { describe, it, expect } from 'vitest';
import { findNmblTemplates, compileTemplate, REACT_ALIASES } from '../src/tagged-template.js';
import nmblPlugin from '../src/index.js';
import type { Plugin } from 'vite';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTagPlugin(opts: Parameters<typeof nmblPlugin>[0] = {}): any {
  const plugins = nmblPlugin({ jsx: {}, ...opts }) as Plugin[];
  return plugins.find((p) => p.name === 'nmbl:tagged-template')!;
}

const ctx = {
  errors: [] as string[],
  error(msg: string) {
    this.errors.push(msg);
    throw new Error(msg);
  },
};

// ─── Scanner unit tests ───────────────────────────────────────────────────────

describe('findNmblTemplates — scanner', () => {
  it('finds a basic template', () => {
    const code = 'const x = nmbl`div hello`';
    const found = findNmblTemplates(code);
    expect(found).toHaveLength(1);
    expect(found[0].content).toBe('div hello');
    expect(found[0].holes).toHaveLength(0);
    expect(code.slice(found[0].start, found[0].end)).toBe('nmbl`div hello`');
  });

  it('finds holes with nested string inside', () => {
    const code = 'nmbl`div ${fn("a","b")} end`';
    const found = findNmblTemplates(code);
    expect(found).toHaveLength(1);
    expect(found[0].holes).toHaveLength(1);
    expect(found[0].holes[0].expr).toBe('fn("a","b")');
  });

  it('finds holes with nested template literal inside', () => {
    const code = 'nmbl`div ${`hello ${name}`} end`';
    const found = findNmblTemplates(code);
    expect(found).toHaveLength(1);
    expect(found[0].holes[0].expr).toBe('`hello ${name}`');
  });

  it('finds holes with nested braces', () => {
    const code = 'nmbl`div ${obj.method({ a: 1 })} text`';
    const found = findNmblTemplates(code);
    expect(found).toHaveLength(1);
    expect(found[0].holes[0].expr).toBe('obj.method({ a: 1 })');
  });

  it('ignores nmbl` inside a line comment', () => {
    const code = '// nmbl`not real`\nconst x = 1;';
    const found = findNmblTemplates(code);
    expect(found).toHaveLength(0);
  });

  it('ignores nmbl` inside a block comment', () => {
    const code = '/* nmbl`not real` */\nconst x = 1;';
    const found = findNmblTemplates(code);
    expect(found).toHaveLength(0);
  });

  it('ignores nmbl` inside a double-quoted string', () => {
    const code = 'const s = "nmbl`not real`";';
    const found = findNmblTemplates(code);
    expect(found).toHaveLength(0);
  });

  it('ignores nmbl` inside a single-quoted string', () => {
    const code = "const s = 'nmbl`not real`';";
    const found = findNmblTemplates(code);
    expect(found).toHaveLength(0);
  });

  it('ignores foo.nmbl` (identifier continuation)', () => {
    const code = 'foo.nmbl`div`';
    const found = findNmblTemplates(code);
    expect(found).toHaveLength(0);
  });

  it('ignores mynmbl` (identifier continuation)', () => {
    const code = 'mynmbl`div`';
    const found = findNmblTemplates(code);
    expect(found).toHaveLength(0);
  });

  it('finds two templates in one file', () => {
    const code = 'const a = nmbl`div a`;\nconst b = nmbl`div b`;';
    const found = findNmblTemplates(code);
    expect(found).toHaveLength(2);
    expect(found[0].content).toBe('div a');
    expect(found[1].content).toBe('div b');
  });

  it('handles escaped backtick inside template', () => {
    const code = 'const x = nmbl`div \\` end`;';
    const found = findNmblTemplates(code);
    // The template runs to the unescaped closing backtick after "end"
    expect(found).toHaveLength(1);
    expect(found[0].content).toContain('\\`');
  });

  it('builds placeholder names in content', () => {
    const code = 'nmbl`h1 ${title}`';
    const found = findNmblTemplates(code);
    expect(found[0].content).toBe('h1 __NMBL_X0__');
  });
});

// ─── Placeholder substitution tests ──────────────────────────────────────────

describe('compileTemplate — :md content blocks', () => {
  it('renders markdown into dangerouslySetInnerHTML (raw HTML is not JSX)', () => {
    const result = compileTemplate('div.prose:md\n  ### Hi\n\n  Some `{x}` code.', [], { attributeAliases: REACT_ALIASES });
    expect(result.error).toBeUndefined();
    expect(result.code).toContain('dangerouslySetInnerHTML={{ __html:');
    expect(result.code).toContain('<h3>Hi</h3>');
    // body is a JS string literal — braces/tags inside never parse as JSX
    expect(result.code).toContain('&#123;x&#125;');
  });
});

describe('compileTemplate — placeholder substitution', () => {
  it('substitutes hole in text position', () => {
    const result = compileTemplate('h3 __NMBL_X0__', ['item.name'], { attributeAliases: REACT_ALIASES });
    expect(result.error).toBeUndefined();
    expect(result.code).toContain('<h3>{item.name}</h3>');
  });

  it('substitutes hole in attribute value position', () => {
    // An attribute with a placeholder as its value
    const result = compileTemplate('div(id=__NMBL_X0__) text', ['myId'], { attributeAliases: REACT_ALIASES });
    expect(result.error).toBeUndefined();
    // Should emit id={myId} not id="myId"
    expect(result.code).toContain('id={myId}');
  });

  it('substitutes hole already inside braces (expression context)', () => {
    // @if with placeholder condition — placeholder ends up inside { condition && … }
    const result = compileTemplate(
      '@if(__NMBL_X0__)\n  p shown',
      ['isOpen'],
      { attributeAliases: REACT_ALIASES },
    );
    expect(result.error).toBeUndefined();
    // Should contain the raw expression inside the JSX brace expression
    expect(result.code).toContain('isOpen');
    expect(result.code).not.toContain('{isOpen}'); // should be raw, not double-wrapped
  });
});

// ─── Transform integration tests via plugin ───────────────────────────────────

describe('nmbl:tagged-template — transform integration', () => {
  it('react: compiles div.card with interpolated text child', () => {
    const p = getTagPlugin({ jsx: { framework: 'react' } });
    const code = 'const x = nmbl`div.card\n  h3 ${item.name}\n`;';
    const out = p.transform.call(ctx, code, '/x/Component.tsx');
    expect(out).toBeTruthy();
    expect(out.code).toContain('<div className="card">');
    expect(out.code).toContain('<h3>{item.name}</h3>');
    expect(out.code).not.toContain('`');
  });

  it('solid: preserves class (no attributeAliases)', () => {
    const p = getTagPlugin({ jsx: { framework: 'solid' } });
    const code = 'const x = nmbl`div.card\n  p hello\n`;';
    const out = p.transform.call(ctx, code, '/x/Component.tsx');
    expect(out).toBeTruthy();
    expect(out.code).toContain('class="card"');
    expect(out.code).not.toContain('className');
  });

  it('hole in attribute position: onClick handler', () => {
    const p = getTagPlugin({ jsx: { framework: 'react' } });
    // Write as raw JS string so vitest doesn't try to parse the template
    const code = 'const x = nmbl`button(onClick=${() => go(1)}) Hit`;';
    const out = p.transform.call(ctx, code, '/x/Component.tsx');
    expect(out).toBeTruthy();
    expect(out.code).toContain('onClick={() => go(1)}');
    expect(out.code).not.toContain('`');
  });

  it('@each with :key compiles and substitutes hole in collection', () => {
    const p = getTagPlugin({ jsx: { framework: 'react' } });
    const code = [
      'const x = nmbl`',
      '@each(item of ${items} :key=item.id)',
      '  li ${item.name}',
      '`;',
    ].join('\n');
    const out = p.transform.call(ctx, code, '/x/Component.tsx');
    expect(out).toBeTruthy();
    expect(out.code).toContain('.map(');
    expect(out.code).toContain('key=');
  });

  it('multi-root output is wrapped in a fragment', () => {
    const p = getTagPlugin({ jsx: { framework: 'react' } });
    const code = 'const x = nmbl`h1 Title\np Subtitle`;';
    const out = p.transform.call(ctx, code, '/x/Component.tsx');
    expect(out).toBeTruthy();
    expect(out.code).toContain('<>');
    expect(out.code).toContain('</>');
  });

  it('file with only a line comment containing nmbl` returns undefined', () => {
    const p = getTagPlugin();
    const code = '// nmbl`not real`\nconst x = 1;';
    const out = p.transform.call(ctx, code, '/x/Component.tsx');
    expect(out).toBeUndefined();
  });

  it('compile error in template throws with message', () => {
    const p = getTagPlugin({ jsx: { framework: 'react' } });
    // @await is not supported with jsx framework
    const code = 'const x = nmbl`@await(promise)\n  p loading`;';
    expect(() => {
      p.transform.call(ctx, code, '/x/Component.tsx');
    }).toThrow();
  });

  it('generates a source map', () => {
    const p = getTagPlugin({ jsx: { framework: 'react' } });
    const code = 'const x = nmbl`div hello`;';
    const out = p.transform.call(ctx, code, '/x/Component.tsx');
    expect(out?.map).toBeTruthy();
  });

  it('ignores non-jsx file extensions', () => {
    const p = getTagPlugin();
    const code = 'nmbl`div hello`';
    const out = p.transform.call(ctx, code, '/x/file.vue');
    expect(out).toBeUndefined();
  });
});
