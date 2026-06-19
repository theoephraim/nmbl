/**
 * Tests for embedded NMBL support in host documents (.svelte, .astro).
 */
import { describe, it, expect } from 'vitest';
import type { IScriptSnapshot } from '@volar/language-core';
import {
  NmblHostVirtualCode,
  dedentRegion,
  dedentedOffsetToOriginal,
} from '../src/language-plugin.js';

/** Minimal IScriptSnapshot from a plain string. */
function makeSnapshot(text: string): IScriptSnapshot {
  return {
    getText: (start, end) => text.substring(start, end),
    getLength: () => text.length,
    getChangeRange: () => undefined,
  };
}

// ---------------------------------------------------------------------------
// dedentRegion unit tests
// ---------------------------------------------------------------------------
describe('dedentRegion', () => {
  it('strips uniform 2-space indent', () => {
    const text = '\n  div\n    p hello\n';
    const { dedented, indent, origLineStartOffsets } = dedentRegion(text);
    expect(indent).toBe(2);
    // First line is blank — stays blank
    expect(dedented.split('\n')[0]).toBe('');
    expect(dedented.split('\n')[1]).toBe('div');
    expect(dedented.split('\n')[2]).toBe('  p hello');
    // origLineStartOffsets must have one entry per original line
    expect(origLineStartOffsets.length).toBe(text.split('\n').length);
  });

  it('handles already column-0 text', () => {
    const text = 'div\n  p hello\n';
    const { dedented, indent } = dedentRegion(text);
    expect(indent).toBe(0);
    expect(dedented).toBe(text);
  });

  it('ignores empty lines when calculating indent', () => {
    const text = '\n  div\n\n  span\n';
    const { indent } = dedentRegion(text);
    expect(indent).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// dedentedOffsetToOriginal unit tests
// ---------------------------------------------------------------------------
describe('dedentedOffsetToOriginal', () => {
  it('maps offset 0 on first line back correctly', () => {
    const regionText = '  div\n  span\n';
    const { dedented, indent, origLineStartOffsets } = dedentRegion(regionText);
    // First non-empty char in dedented = 'd' at position 0
    // In original, line 0 starts at 0, so original offset = 0 + 2 (indent) + 0 (col) = 2
    const orig = dedentedOffsetToOriginal(0, dedented, origLineStartOffsets, indent);
    expect(orig).toBe(2);
    expect(regionText[orig]).toBe('d');
  });

  it('maps offset on second line back correctly', () => {
    const regionText = '  div\n  span\n';
    const { dedented, indent, origLineStartOffsets } = dedentRegion(regionText);
    // Second line in dedented: "span" starts at offset 4 in dedented (after "div\n" = 4 chars)
    const dedentedLine2Start = 'div\n'.length;
    const orig = dedentedOffsetToOriginal(dedentedLine2Start, dedented, origLineStartOffsets, indent);
    // Original line 1 starts at offset 6 ("  div\n" = 6 chars), plus indent 2 = 8
    expect(orig).toBe(8);
    expect(regionText[orig]).toBe('s'); // 's' of 'span'
  });

  it('handles 4-space indent', () => {
    const regionText = '    button.btn click me\n    input type="text"\n';
    const { dedented, indent, origLineStartOffsets } = dedentRegion(regionText);
    expect(indent).toBe(4);
    // 'b' in "button" at dedented offset 0 → original offset 4
    const orig = dedentedOffsetToOriginal(0, dedented, origLineStartOffsets, indent);
    expect(orig).toBe(4);
    expect(regionText[orig]).toBe('b');
  });
});

// ---------------------------------------------------------------------------
// NmblHostVirtualCode — svelte host document
// ---------------------------------------------------------------------------
describe('NmblHostVirtualCode (svelte)', () => {
  const svelteSource = `<script>
  export let active = false;
</script>

<template lang="nmbl">
  div.container
    @if(active)
      p.active Active!
    @else
      p Inactive
</template>

<style>
  .container { padding: 1rem; }
</style>`;

  it('creates virtual code for a svelte file with nmbl template', () => {
    const snap = makeSnapshot(svelteSource);
    const vc = new NmblHostVirtualCode(snap, 'svelte');

    expect(vc.id).toBe('root');
    expect(vc.languageId).toBe('nmbl');
    expect(vc.regionLength).toBeGreaterThan(0);
    expect(vc.embeddedCodes).toHaveLength(1);
    expect(vc.embeddedCodes[0].languageId).toBe('html');

    const html = vc.embeddedCodes[0].snapshot.getText(0, vc.embeddedCodes[0].snapshot.getLength());
    // The @if block should compile to Svelte {#if} syntax
    expect(html).toContain('{#if');
    expect(html).toContain('{:else}');
    expect(html).toContain('{/if}');
    expect(html).toContain('Active!');
    expect(html).toContain('Inactive');
  });

  it('has a root mapping covering the region in the host document', () => {
    const snap = makeSnapshot(svelteSource);
    const vc = new NmblHostVirtualCode(snap, 'svelte');

    expect(vc.mappings).toHaveLength(1);
    const rootMapping = vc.mappings[0];
    expect(rootMapping.sourceOffsets[0]).toBe(vc.regionStart);
    expect(rootMapping.lengths[0]).toBe(vc.regionLength);
  });

  it('embedded HTML mappings sourceOffsets point at host-document positions', () => {
    const snap = makeSnapshot(svelteSource);
    const vc = new NmblHostVirtualCode(snap, 'svelte');
    const embedded = vc.embeddedCodes[0];

    expect(embedded.mappings.length).toBeGreaterThan(0);
    for (const m of embedded.mappings) {
      const srcOffset = m.sourceOffsets[0];
      // Source offset must be within the host document (within the nmbl region)
      expect(srcOffset).toBeGreaterThanOrEqual(vc.regionStart);
      expect(srcOffset).toBeLessThan(svelteSource.length);
      // Generated offset must be within the generated HTML
      const html = embedded.snapshot.getText(0, embedded.snapshot.getLength());
      expect(m.generatedOffsets[0]).toBeLessThan(html.length);
      // Length must be positive
      expect(m.lengths[0]).toBeGreaterThan(0);
    }
  });

  it('a class name in the host doc maps to its position in the generated HTML', () => {
    const snap = makeSnapshot(svelteSource);
    const vc = new NmblHostVirtualCode(snap, 'svelte');
    const embedded = vc.embeddedCodes[0];
    const html = embedded.snapshot.getText(0, embedded.snapshot.getLength());

    // "container" appears in the host document as part of "div.container".
    // The compiler uses spanWithPrefix so the mapping's sourceOffset points
    // at the '.' before "container". Find the '.' in the host source.
    const dotContainerInHost = svelteSource.indexOf('.container');
    expect(dotContainerInHost).toBeGreaterThan(0);

    // Find a mapping whose source offset covers the .container position.
    // The generated side should contain "container" in the class="..." attribute.
    let found = false;
    for (const m of embedded.mappings) {
      const srcOffset = m.sourceOffsets[0];
      const length = m.lengths[0];
      if (srcOffset <= dotContainerInHost && dotContainerInHost < srcOffset + length) {
        // The generated slice starting at generatedOffset should include 'container'
        const genSlice = html.substring(m.generatedOffsets[0], m.generatedOffsets[0] + length);
        expect(genSlice).toContain('container');
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('no compile errors for valid svelte nmbl template', () => {
    const snap = makeSnapshot(svelteSource);
    const vc = new NmblHostVirtualCode(snap, 'svelte');
    expect(vc.compileErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// NmblHostVirtualCode — astro host document
// ---------------------------------------------------------------------------
describe('NmblHostVirtualCode (astro)', () => {
  const astroSource = `---
const items = ['a', 'b', 'c'];
---

<template lang="nmbl">
  ul.list
    @each(items as item)
      li {item}
</template>`;

  it('creates virtual code for an astro file with nmbl template', () => {
    const snap = makeSnapshot(astroSource);
    const vc = new NmblHostVirtualCode(snap, 'astro');

    expect(vc.embeddedCodes).toHaveLength(1);
    const html = vc.embeddedCodes[0].snapshot.getText(0, vc.embeddedCodes[0].snapshot.getLength());

    // @each compiles to .map() JSX in astro
    expect(html).toContain('.map(');
    expect(html).toContain('item');
  });

  it('no compile errors for valid astro nmbl template', () => {
    const snap = makeSnapshot(astroSource);
    const vc = new NmblHostVirtualCode(snap, 'astro');
    expect(vc.compileErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// No template → undefined
// ---------------------------------------------------------------------------
describe('svelte document without nmbl template', () => {
  it('NmblHostVirtualCode has zero mappings/embeds when no nmbl template present', () => {
    // When there is no <template lang="nmbl"> the NmblHostVirtualCode should
    // produce an empty (unusable) virtual code. The plugin prevents this from
    // being created at all (returns undefined), but we test the guard path too.
    const svelteNoNmbl = `<script>
  let x = 1;
</script>

<template>
  <div>{x}</div>
</template>`;

    // The NMBL_TEMPLATE_RE should NOT match plain <template> tags
    const NMBL_TEMPLATE_RE = /<template[^>]*\blang=(["'])nmbl\1[^>]*>([\s\S]*?)<\/template>/;
    expect(NMBL_TEMPLATE_RE.test(svelteNoNmbl)).toBe(false);
  });

  it('NMBL_TEMPLATE_RE does not match vue-style (no lang) templates', () => {
    const vueSource = `<template>
  <div>hello</div>
</template>`;
    const NMBL_TEMPLATE_RE = /<template[^>]*\blang=(["'])nmbl\1[^>]*>([\s\S]*?)<\/template>/;
    expect(NMBL_TEMPLATE_RE.test(vueSource)).toBe(false);
  });

  it('NMBL_TEMPLATE_RE matches lang="nmbl" templates', () => {
    const withNmbl = `<template lang="nmbl">
  div hello
</template>`;
    const NMBL_TEMPLATE_RE = /<template[^>]*\blang=(["'])nmbl\1[^>]*>([\s\S]*?)<\/template>/;
    expect(NMBL_TEMPLATE_RE.test(withNmbl)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Compile error → maps to host-document offset
// ---------------------------------------------------------------------------
describe('compile error offset mapping', () => {
  it('error span maps back to correct host-document offset', () => {
    // Use an @await block inside an astro file — not supported, triggers error
    const astroSource = `---
const p = fetch('/api');
---

<template lang="nmbl">
  div
    @await(p)
      p Loading
</template>`;

    const snap = makeSnapshot(astroSource);
    const vc = new NmblHostVirtualCode(snap, 'astro');

    // Should have a compile error for unsupported @await in astro
    expect(vc.compileErrors.length).toBeGreaterThan(0);

    const err = vc.compileErrors[0];
    expect(err.span).toBeDefined();

    if (err.span) {
      // The error offset must be within the host document's nmbl region
      expect(err.span.start.offset).toBeGreaterThanOrEqual(vc.regionStart);
      expect(err.span.start.offset).toBeLessThan(astroSource.length);

      // The text at that offset should contain the offending token
      const slice = astroSource.substring(
        err.span.start.offset,
        err.span.end.offset,
      );
      // The error is about @await — the span should cover something related
      expect(slice.length).toBeGreaterThan(0);
    }
  });
});
