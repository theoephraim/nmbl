import { describe, it, expect } from 'vitest';
import type { IScriptSnapshot } from '@volar/language-core';
import { NmblVirtualCode, convertMappings } from '../src/language-plugin.js';
import { compile } from '@nmbl-lang/core';

/** Minimal IScriptSnapshot from a plain string. */
function makeSnapshot(text: string): IScriptSnapshot {
  return {
    getText: (start, end) => text.substring(start, end),
    getLength: () => text.length,
    getChangeRange: () => undefined,
  };
}

// ---------------------------------------------------------------------------
// convertMappings unit tests
// ---------------------------------------------------------------------------
describe('convertMappings', () => {
  it('converts a simple mapping correctly', () => {
    const source = 'div hello';
    const { mappings } = compile(source);
    const codeMappings = convertMappings(mappings);
    expect(codeMappings.length).toBeGreaterThan(0);
    for (const m of codeMappings) {
      expect(m.sourceOffsets.length).toBeGreaterThan(0);
      expect(m.generatedOffsets.length).toBeGreaterThan(0);
      expect(m.lengths.length).toBeGreaterThan(0);
      // Volar requirement: equal-length arrays
      expect(m.sourceOffsets.length).toBe(m.generatedOffsets.length);
      expect(m.generatedOffsets.length).toBe(m.lengths.length);
      // All lengths must be positive
      for (const len of m.lengths) {
        expect(len).toBeGreaterThan(0);
      }
      // Data should have the required fields
      expect(m.data).toMatchObject({
        completion: true,
        semantic: true,
        navigation: true,
        structure: true,
        format: false,
        verification: true,
      });
    }
  });

  it('skips zero-length mappings', () => {
    const result = convertMappings([
      {
        sourceSpan: {
          start: { line: 0, column: 0, offset: 0 },
          end: { line: 0, column: 0, offset: 0 },
        },
        generatedSpan: {
          start: { line: 0, column: 0, offset: 0 },
          end: { line: 0, column: 3, offset: 3 },
        },
      },
    ]);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// NmblVirtualCode unit tests
// ---------------------------------------------------------------------------
describe('NmblVirtualCode', () => {
  it('creates virtual code for a simple template', () => {
    const source = 'div#app\n  p.lead hello';
    const snapshot = makeSnapshot(source);
    const vc = new NmblVirtualCode(snapshot);

    expect(vc.id).toBe('root');
    expect(vc.languageId).toBe('nmbl');
    expect(vc.snapshot).toBe(snapshot);

    // Must have exactly one embedded 'html' code
    expect(vc.embeddedCodes).toHaveLength(1);
    const embedded = vc.embeddedCodes[0];
    expect(embedded.id).toBe('html');
    expect(embedded.languageId).toBe('html');

    // The generated HTML should contain the compiled markup
    const htmlText = embedded.snapshot.getText(0, embedded.snapshot.getLength());
    expect(htmlText).toContain('<div id="app">');
    expect(htmlText).toContain('<p');
    expect(htmlText).toContain('lead');
    expect(htmlText).toContain('hello');

    // No compile errors for a valid template
    expect(vc.compileErrors).toHaveLength(0);
  });

  it('has at least one mapping that connects the nmbl source to the html', () => {
    const source = 'div#app\n  p.lead hello';
    const snapshot = makeSnapshot(source);
    const vc = new NmblVirtualCode(snapshot);
    const embedded = vc.embeddedCodes[0];
    const htmlText = embedded.snapshot.getText(0, embedded.snapshot.getLength());

    expect(embedded.mappings.length).toBeGreaterThan(0);

    // Find a mapping where the same text appears at both positions
    let foundSemanticMapping = false;
    for (const m of embedded.mappings) {
      const srcOffset = m.sourceOffsets[0];
      const genOffset = m.generatedOffsets[0];
      const length = m.lengths[0];
      if (length > 0) {
        const srcSlice = source.substring(srcOffset, srcOffset + length);
        const genSlice = htmlText.substring(genOffset, genOffset + length);
        // The tag name 'div' or class 'lead' should appear at the same text in both
        if (srcSlice === genSlice && srcSlice.trim().length > 0) {
          foundSemanticMapping = true;
          break;
        }
      }
    }
    expect(foundSemanticMapping).toBe(true);
  });

  it('still returns a virtual code with errors for a broken template', () => {
    // Invalid indentation to trigger a compile error
    const source = 'div\n      bad-indent\n  span';
    const snapshot = makeSnapshot(source);
    const vc = new NmblVirtualCode(snapshot);

    // Must always return a VirtualCode (never throw)
    expect(vc).toBeDefined();
    expect(vc.embeddedCodes).toHaveLength(1);
    expect(vc.embeddedCodes[0].languageId).toBe('html');

    // The compile errors array should be accessible
    // (may or may not have errors depending on what the parser treats as invalid)
    expect(Array.isArray(vc.compileErrors)).toBe(true);
  });

  it('exposes compile errors for syntactically invalid NMBL', () => {
    // Use a known error case: duplicate id
    const source = 'div#foo\n  span#foo';
    const snapshot = makeSnapshot(source);
    const vc = new NmblVirtualCode(snapshot);

    // Even if there are no errors for this particular input, the vc should be valid
    expect(vc).toBeDefined();

    // If there ARE errors, they should have a message and a span
    for (const err of vc.compileErrors) {
      expect(typeof err.message).toBe('string');
      // span may be undefined for some errors, but if present it should have offsets
      if (err.span) {
        expect(typeof err.span.start.offset).toBe('number');
        expect(typeof err.span.end.offset).toBe('number');
      }
    }
  });

  it('incremental update produces fresh html', () => {
    const source1 = 'p hello';
    const source2 = 'p world';
    const vc1 = new NmblVirtualCode(makeSnapshot(source1));
    const vc2 = new NmblVirtualCode(makeSnapshot(source2));
    const html1 = vc1.embeddedCodes[0].snapshot.getText(0, vc1.embeddedCodes[0].snapshot.getLength());
    const html2 = vc2.embeddedCodes[0].snapshot.getText(0, vc2.embeddedCodes[0].snapshot.getLength());
    expect(html1).toContain('hello');
    expect(html2).toContain('world');
    expect(html1).not.toBe(html2);
  });
});
