import { describe, it, expect } from 'vitest';
import { highlightTree, classHighlighter } from '@lezer/highlight';
import { nmblLanguage } from '../src/index.js';

/** Parse a doc through the real StreamLanguage and return [text, classes] pairs. */
function highlight(doc: string): [string, string][] {
  const tree = nmblLanguage.parser.parse(doc);
  const out: [string, string][] = [];
  highlightTree(tree, classHighlighter, (from, to, cls) => out.push([doc.slice(from, to), cls]));
  return out;
}

function classOf(pairs: [string, string][], text: string): string {
  return pairs.find(([t]) => t === text)?.[1] ?? '';
}

describe('nmblLanguage (StreamLanguage integration)', () => {
  it('highlights a tag head per part', () => {
    const h = highlight('div.card(href="/x") Go');
    // CM's stream parser maps legacy names: 'tagName' → typeName tag, 'attributeName' → propertyName tag
    expect(classOf(h, 'div')).toContain('typeName');
    expect(classOf(h, '.card')).toContain('propertyName');
    expect(classOf(h, 'href')).toContain('propertyName');
    expect(classOf(h, '"/x"')).toContain('string');
  });

  it('spaced selectors fall to plain text (no class style)', () => {
    const h = highlight('div .card');
    expect(classOf(h, '.card')).not.toContain('propertyName');
  });

  it('per-line state reset: second line tag highlights', () => {
    const h = highlight('div.a\nspan.b');
    expect(classOf(h, 'span')).toContain('typeName');
    expect(classOf(h, '.b')).toContain('propertyName');
  });

  it('multi-line attribute lists keep attr context across lines', () => {
    const h = highlight('button(\n  type="submit"\n) Save');
    expect(classOf(h, 'type')).toContain('propertyName');
    expect(classOf(h, '"submit"')).toContain('string');
  });

  it('interpolated template values highlight as strings', () => {
    const h = highlight('a(href=`/u/${id}`) x');
    const stringText = h.filter(([, c]) => c.includes('string')).map(([t]) => t).join('');
    expect(stringText).toContain('`/u/');
  });
});
