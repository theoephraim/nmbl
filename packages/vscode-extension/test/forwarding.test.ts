/**
 * Unit tests for the pure-logic portions of embedded-forwarding.ts.
 *
 * These run in plain Node via vitest — no VS Code host required.
 * The `vscode` module is aliased to a minimal stub in vitest.config.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  findNmblRegion,
  isOffsetInNmblRegion,
  isTagNamePosition,
  isPascalCase,
  isComponentCandidate,
  mapToTemplateItem,
  findLastNonBlankLineOffset,
  findScriptAnchorOffset,
  getItemLabel,
  htmlTagNames,
  buildHtmlTagItems,
  attributeContext,
  buildAttributeItems,
  VUE_DIRECTIVES,
} from '../client/embedded-forwarding';
import {
  CompletionItem,
  CompletionItemKind,
  Range,
  Position,
} from './__mocks__/vscode';

// ---------------------------------------------------------------------------
// findNmblRegion
// ---------------------------------------------------------------------------

describe('findNmblRegion', () => {
  it('returns undefined when no template present', () => {
    expect(findNmblRegion('<div>hello</div>')).toBeUndefined();
  });

  it('finds a simple <template lang="nmbl"> region', () => {
    const text = '<template lang="nmbl">Hello world</template>';
    const region = findNmblRegion(text);
    expect(region).toBeDefined();
    // body starts after the opening tag's ">"
    const openTag = '<template lang="nmbl">';
    expect(region!.start).toBe(openTag.length);
    expect(region!.end).toBe(openTag.length + 'Hello world'.length);
  });

  it("works with single-quoted lang='nmbl'", () => {
    const text = "<template lang='nmbl'>body</template>";
    const region = findNmblRegion(text);
    expect(region).toBeDefined();
    const openTag = "<template lang='nmbl'>";
    expect(region!.start).toBe(openTag.length);
  });

  it('works when template has additional attributes', () => {
    const text = '<template lang="nmbl" foo="bar">content</template>';
    const region = findNmblRegion(text);
    expect(region).toBeDefined();
    expect(text.substring(region!.start, region!.end)).toBe('content');
  });

  it('does not match <template lang="html">', () => {
    expect(findNmblRegion('<template lang="html">x</template>')).toBeUndefined();
  });

  it('handles multi-line bodies', () => {
    const body = '\n  Hello\n  World\n';
    const text = `<template lang="nmbl">${body}</template>`;
    const region = findNmblRegion(text);
    expect(region).toBeDefined();
    expect(text.substring(region!.start, region!.end)).toBe(body);
  });
});

// ---------------------------------------------------------------------------
// isOffsetInNmblRegion
// ---------------------------------------------------------------------------

describe('isOffsetInNmblRegion', () => {
  const openTag = '<template lang="nmbl">';
  const body = 'Hello';
  const text = `${openTag}${body}</template>`;

  it('returns region when offset is inside body', () => {
    const result = isOffsetInNmblRegion(text, openTag.length + 1);
    expect(result).toBeDefined();
  });

  it('returns undefined when offset is before body', () => {
    expect(isOffsetInNmblRegion(text, 0)).toBeUndefined();
  });

  it('returns undefined when offset is after body', () => {
    expect(isOffsetInNmblRegion(text, openTag.length + body.length + 5)).toBeUndefined();
  });

  it('returns undefined when no nmbl region exists', () => {
    expect(isOffsetInNmblRegion('<div>hi</div>', 2)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isTagNamePosition
// ---------------------------------------------------------------------------

describe('isTagNamePosition', () => {
  it('returns true for empty line prefix', () => {
    expect(isTagNamePosition('')).toBe(true);
  });

  it('returns true for whitespace-only prefix', () => {
    expect(isTagNamePosition('  ')).toBe(true);
    expect(isTagNamePosition('\t\t')).toBe(true);
  });

  it('returns true when prefix ends with <', () => {
    expect(isTagNamePosition('<')).toBe(true);
    expect(isTagNamePosition('  <')).toBe(true);
  });

  it('returns true when prefix ends with > (block expansion)', () => {
    expect(isTagNamePosition('SomeTag> ')).toBe(true);
    expect(isTagNamePosition('  SomeTag>')).toBe(true);
  });

  it('returns false for a prefix that is mid-sentence prose', () => {
    // "Hello " before "World" — not a tag position
    expect(isTagNamePosition('Hello ')).toBe(false);
  });

  it('returns false for attribute-like prefix', () => {
    expect(isTagNamePosition('<Foo bar=')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isPascalCase
// ---------------------------------------------------------------------------

describe('isPascalCase', () => {
  it('accepts standard PascalCase names', () => {
    expect(isPascalCase('Badge')).toBe(true);
    expect(isPascalCase('MyComponent')).toBe(true);
    expect(isPascalCase('A')).toBe(true);
    expect(isPascalCase('Foo123')).toBe(true);
  });

  it('rejects lowercase-starting names', () => {
    expect(isPascalCase('badge')).toBe(false);
    expect(isPascalCase('myComponent')).toBe(false);
  });

  it('rejects names with hyphens or spaces', () => {
    expect(isPascalCase('My-Component')).toBe(false);
    expect(isPascalCase('My Component')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isPascalCase('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getItemLabel
// ---------------------------------------------------------------------------

describe('getItemLabel', () => {
  it('returns a plain string label as-is', () => {
    expect(getItemLabel('Foo')).toBe('Foo');
  });

  it('extracts .label from a CompletionItemLabel object', () => {
    expect(getItemLabel({ label: 'Badge', description: 'auto-import' })).toBe('Badge');
  });
});

// ---------------------------------------------------------------------------
// isComponentCandidate
// ---------------------------------------------------------------------------

describe('isComponentCandidate', () => {
  function makeItem(
    label: string,
    kind?: CompletionItemKind,
    detail?: string,
  ): CompletionItem {
    const item = new CompletionItem(label, kind);
    item.detail = detail;
    return item;
  }

  it('accepts PascalCase Class items', () => {
    expect(isComponentCandidate(makeItem('Badge', CompletionItemKind.Class))).toBe(true);
  });

  it('accepts PascalCase Variable items', () => {
    expect(isComponentCandidate(makeItem('Badge', CompletionItemKind.Variable))).toBe(true);
  });

  it('accepts PascalCase Function items', () => {
    expect(isComponentCandidate(makeItem('Icon', CompletionItemKind.Function))).toBe(true);
  });

  it('accepts PascalCase items with module-path detail (auto-import)', () => {
    const item = makeItem('Badge', undefined, "Auto import from './Badge.svelte'");
    expect(isComponentCandidate(item)).toBe(true);
  });

  it('rejects lowercase label', () => {
    expect(isComponentCandidate(makeItem('badge', CompletionItemKind.Class))).toBe(false);
  });

  it('rejects PascalCase with Text kind and no path detail', () => {
    // Text kind is not in the preferred set and no path in detail
    expect(isComponentCandidate(makeItem('Badge', CompletionItemKind.Text))).toBe(false);
  });

  it('accepts PascalCase with labelDetails description that looks like a path', () => {
    const item = new CompletionItem({ label: 'Card', description: './Card.svelte' });
    expect(isComponentCandidate(item)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mapToTemplateItem
// ---------------------------------------------------------------------------

describe('mapToTemplateItem', () => {
  const dummyRange = new Range(new Position(5, 2), new Position(5, 5));

  it('maps label, kind, insertText, range correctly', () => {
    const source = new CompletionItem('Badge', CompletionItemKind.Class);
    source.detail = 'Badge component';
    const mapped = mapToTemplateItem(source, dummyRange, false);
    expect(getItemLabel(mapped.label)).toBe('Badge');
    expect(mapped.kind).toBe(CompletionItemKind.Class);
    expect(mapped.insertText).toBe('Badge');
    expect(mapped.range).toBe(dummyRange);
  });

  it('prefixes detail with (component)', () => {
    const source = new CompletionItem('Badge', CompletionItemKind.Class);
    source.detail = 'From Badge.svelte';
    const mapped = mapToTemplateItem(source, dummyRange, false);
    expect(mapped.detail).toContain('(component)');
    expect(mapped.detail).toContain('From Badge.svelte');
  });

  it('sorts already-imported components first', () => {
    const s1 = new CompletionItem('Badge', CompletionItemKind.Class);
    const s2 = new CompletionItem('Card', CompletionItemKind.Class);
    const imported = mapToTemplateItem(s1, dummyRange, true);
    const notImported = mapToTemplateItem(s2, dummyRange, false);
    expect(imported.sortText! < notImported.sortText!).toBe(true);
  });

  it('keeps additionalTextEdits from source', () => {
    const source = new CompletionItem('Badge', CompletionItemKind.Class);
    const fakeEdit = { range: dummyRange, newText: "import Badge from './Badge.svelte';\n" };
    source.additionalTextEdits = [fakeEdit as never];
    const mapped = mapToTemplateItem(source, dummyRange, false);
    expect(mapped.additionalTextEdits).toBe(source.additionalTextEdits);
  });
});

// ---------------------------------------------------------------------------
// findLastNonBlankLineOffset
// ---------------------------------------------------------------------------

describe('findLastNonBlankLineOffset', () => {
  it('finds offset of last non-blank line', () => {
    const text = 'line1\nline2\n\n';
    // from offset 0 — "line2" starts at 6
    const offset = findLastNonBlankLineOffset(text, 0);
    expect(offset).toBe(6);
  });

  it('returns fromOffset when all lines are blank', () => {
    const text = '\n\n\n';
    expect(findLastNonBlankLineOffset(text, 0)).toBe(0);
  });

  it('respects fromOffset', () => {
    const text = 'preamble\nline1\nline2\n\n';
    // skip the first 9 chars ("preamble\n"), start from "line1"
    const offset = findLastNonBlankLineOffset(text, 9);
    expect(offset).toBe(9 + 'line1\n'.length); // "line2" starts at 15
  });
});

// ---------------------------------------------------------------------------
// findScriptAnchorOffset
// ---------------------------------------------------------------------------

describe('findScriptAnchorOffset', () => {
  it('finds anchor inside a svelte <script> block', () => {
    const text = [
      '<script lang="ts">',
      "import Foo from './Foo.svelte';",
      '',
      '</script>',
      '<template lang="nmbl">',
      'Hello',
      '</template>',
    ].join('\n');
    const offset = findScriptAnchorOffset(text, 'svelte');
    expect(offset).toBeDefined();
    // Should point at the "import Foo" line (the last non-blank line before </script>)
    const snippet = text.substring(offset!);
    expect(snippet).toMatch(/import Foo/);
  });

  it('returns undefined when svelte has no <script>', () => {
    const text = '<template lang="nmbl">Hello</template>';
    expect(findScriptAnchorOffset(text, 'svelte')).toBeUndefined();
  });

  it('finds anchor inside astro frontmatter', () => {
    const text = [
      '---',
      "import Badge from '../components/Badge.astro';",
      '---',
      '',
      '<template lang="nmbl">',
      'Hello',
      '</template>',
    ].join('\n');
    const offset = findScriptAnchorOffset(text, 'astro');
    expect(offset).toBeDefined();
    const snippet = text.substring(offset!);
    expect(snippet).toMatch(/import Badge/);
  });

  it('returns undefined for astro with no frontmatter', () => {
    const text = '<template lang="nmbl">Hello</template>';
    expect(findScriptAnchorOffset(text, 'astro')).toBeUndefined();
  });

  it('finds anchor inside a vue <script setup> block', () => {
    const text = [
      '<script setup lang="ts">',
      "import VButton from './components/VButton.vue';",
      '',
      '</script>',
      '<template lang="nmbl">',
      'div',
      '  VButton(:label="x")',
      '</template>',
    ].join('\n');
    // .vue is handled by the generic <script> branch (languageId !== 'astro').
    const offset = findScriptAnchorOffset(text, 'vue');
    expect(offset).toBeDefined();
    const snippet = text.substring(offset!);
    expect(snippet).toMatch(/import VButton/);
  });
});

// ---------------------------------------------------------------------------
// HTML tag completions
// ---------------------------------------------------------------------------

describe('buildHtmlTagItems', () => {
  it('includes common HTML tags (sourced from vscode-html-languageservice)', () => {
    const names = htmlTagNames();
    for (const tag of ['div', 'span', 'button', 'input', 'a', 'ul', 'li']) {
      expect(names).toContain(tag);
    }
  });

  it('produces one item per tag, targeted at the word range, with docs', () => {
    const range = new Range(new Position(1, 2), new Position(1, 5));
    const items = buildHtmlTagItems(range);
    expect(items).toHaveLength(htmlTagNames().length);
    const div = items.find(i => getItemLabel(i.label) === 'div')!;
    expect(div).toBeDefined();
    expect(div.insertText).toBe('div');
    expect(div.range).toBe(range);
    // Sorts after components (which use 0_/1_ prefixes).
    expect(div.sortText).toBe('2_div');
    // Description comes from the HTML dataset.
    expect(typeof div.documentation).toBe('string');
    expect((div.documentation as string).length).toBeGreaterThan(0);
  });

  it('contains no PascalCase entries (those are components, not html tags)', () => {
    expect(htmlTagNames().every(t => t === t.toLowerCase())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// attributeContext (cursor classification)
// ---------------------------------------------------------------------------

describe('attributeContext', () => {
  const attr = (s: string) => attributeContext(s);

  it('detects an attribute position inside a tag paren', () => {
    expect(attr('button(@cli')).toEqual({ inAttr: true, tag: 'button' });
    expect(attr('div(class="x" @cl')).toEqual({ inAttr: true, tag: 'div' });
    expect(attr('input(:val')).toEqual({ inAttr: true, tag: 'input' });
  });

  it('detects attribute position across multiple lines', () => {
    expect(attr('VButton(\n  :label="x"\n  @cl')).toEqual({ inAttr: true, tag: 'VButton' });
  });

  it('treats .class/#id shorthands as implicit div with their real tag', () => {
    expect(attr('span.foo(@cl')).toEqual({ inAttr: true, tag: 'span' });
  });

  it('is NOT an attribute position inside @if/@each control flow', () => {
    expect(attr('@if(loggedIn').inAttr).toBe(false);
    expect(attr('@each(items as item').inAttr).toBe(false);
  });

  it('is NOT an attribute position inside an interpolation', () => {
    expect(attr('p {{ item.').inAttr).toBe(false);
  });

  it('is NOT an attribute position inside an attribute value string', () => {
    expect(attr('div(:label="item.').inAttr).toBe(false);
  });

  it('is NOT an attribute position inside a brace value', () => {
    expect(attr('div(class={fo').inAttr).toBe(false);
  });

  it('is NOT an attribute position after the parens close', () => {
    expect(attr('div(class="x") ').inAttr).toBe(false);
  });

  it('is NOT an attribute position at plain tag/text', () => {
    expect(attr('  div').inAttr).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildAttributeItems
// ---------------------------------------------------------------------------

describe('buildAttributeItems', () => {
  const range = new Range(new Position(2, 4), new Position(2, 8));

  it('includes Vue directives', () => {
    const labels = buildAttributeItems(range, 'div').map(i => getItemLabel(i.label));
    for (const d of VUE_DIRECTIVES) expect(labels).toContain(d);
    expect(labels).toContain('v-if');
  });

  it('derives @events from the element on* attributes', () => {
    const labels = buildAttributeItems(range, 'button').map(i => getItemLabel(i.label));
    expect(labels).toContain('@click');
    expect(labels).toContain('@input');
    // never the raw on* form
    expect(labels).not.toContain('onclick');
  });

  it('offers plain and bound forms of regular attributes', () => {
    const labels = buildAttributeItems(range, 'button').map(i => getItemLabel(i.label));
    expect(labels).toContain('disabled');
    expect(labels).toContain(':disabled');
  });

  it('targets items at the given word range', () => {
    const item = buildAttributeItems(range, 'div')[0];
    expect(item.range).toBe(range);
  });
});
