import { describe, test, expect } from 'vitest';
import { nmblPreprocess } from '../dist/index.mjs';

// ─── Tiny VLQ decoder ─────────────────────────────────────────────────────────
// @jridgewell/trace-mapping is not hoisted into this package, so we hand-roll
// a minimal VLQ decoder sufficient for the source-map validity test.

const VLQ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeVlq(encoded: string): number[] {
  const results: number[] = [];
  let value = 0;
  let shift = 0;
  for (const ch of encoded) {
    const digit = VLQ_CHARS.indexOf(ch);
    if (digit === -1) throw new Error(`Invalid VLQ char: ${ch}`);
    const hasContinuation = digit & 0x20;
    value |= (digit & 0x1f) << shift;
    shift += 5;
    if (!hasContinuation) {
      const isNeg = value & 1;
      results.push(isNeg ? -(value >> 1) : value >> 1);
      value = 0;
      shift = 0;
    }
  }
  return results;
}

/**
 * Decode a V3 source-map `mappings` string into an array of segments:
 * [{ genLine, genCol, srcLine, srcCol }]
 */
function decodeMappings(mappings: string): Array<{ genLine: number; genCol: number; srcLine: number; srcCol: number }> {
  const result: Array<{ genLine: number; genCol: number; srcLine: number; srcCol: number }> = [];
  let prevSrcLine = 0;
  let prevSrcCol = 0;

  mappings.split(';').forEach((lineStr, genLine) => {
    let prevGenCol = 0;
    if (!lineStr) return;
    for (const seg of lineStr.split(',')) {
      if (!seg) continue;
      const vals = decodeVlq(seg);
      if (vals.length < 4) continue; // no source info
      prevGenCol += vals[0];
      prevSrcLine += vals[2];
      prevSrcCol += vals[3];
      result.push({ genLine, genCol: prevGenCol, srcLine: prevSrcLine, srcCol: prevSrcCol });
    }
  });

  return result;
}

/**
 * Find the decoded segment that covers a generated position (line, col).
 * Returns the last segment whose genLine === line and genCol <= col.
 */
function originalPositionFor(
  mappings: string,
  genLine: number,
  genCol: number,
): { srcLine: number; srcCol: number } | null {
  const segments = decodeMappings(mappings);
  let best: { genLine: number; genCol: number; srcLine: number; srcCol: number } | null = null;
  for (const seg of segments) {
    if (seg.genLine === genLine && seg.genCol <= genCol) {
      if (!best || seg.genCol > best.genCol) best = seg;
    }
  }
  return best ? { srcLine: best.srcLine, srcCol: best.srcCol } : null;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('nmblPreprocess', () => {
  describe('basic extraction and compilation', () => {
    test('compiles <template lang="nmbl"> and leaves script/style untouched', () => {
      const content = `<script>
let count = 0;
</script>
<template lang="nmbl">
div.app
  p.lead Hello
</template>
<style>
.app { color: red; }
</style>`;

      const preprocessor = nmblPreprocess();
      const result = preprocessor.markup({ content, filename: 'Basic.svelte' });

      expect(result).toBeDefined();
      expect(result!.code).toContain('<div class="app">');
      expect(result!.code).toContain('<p class="lead">Hello</p>');
      // Template tag is replaced — not present in output
      expect(result!.code).not.toContain('<template lang="nmbl">');
      expect(result!.code).not.toContain('</template>');
      // Script block untouched
      expect(result!.code).toContain('let count = 0;');
      // Style block untouched
      expect(result!.code).toContain('.app { color: red; }');
    });

    test('returns undefined when no nmbl template is found', () => {
      const content = `<template>\n<div>Hello</div>\n</template>`;
      const preprocessor = nmblPreprocess();
      const result = preprocessor.markup({ content, filename: 'Plain.svelte' });
      expect(result).toBeUndefined();
    });

    test('supports <!-- nmbl --> comment syntax', () => {
      const content = `<script>
let x = 1;
</script>
<!-- nmbl
div.wrapper
  span.label Text
-->`;

      const preprocessor = nmblPreprocess();
      const result = preprocessor.markup({ content, filename: 'Comment.svelte' });

      expect(result).toBeDefined();
      expect(result!.code).toContain('<div class="wrapper">');
      expect(result!.code).toContain('<span class="label">Text</span>');
      expect(result!.code).not.toContain('<!-- nmbl');
      expect(result!.code).toContain('let x = 1;');
    });
  });

  describe(':md content blocks', () => {
    test('renders markdown by default, with code-span braces escaped', () => {
      const content = `<template lang="nmbl">
div.prose:md
  ### Hi

  Some \`{#if x}\` and **bold**.
</template>`;
      const preprocessor = nmblPreprocess();
      const result = preprocessor.markup({ content, filename: 'Md.svelte' });
      expect(result).toBeDefined();
      expect(result!.code).toContain('<h3>Hi</h3>');
      expect(result!.code).toContain('<strong>bold</strong>');
      // svelte parses { } as expressions — code-span braces must be entities
      expect(result!.code).toContain('&#123;#if x&#125;');
    });

    test('a user md filter via options.compiler.filters overrides the default', () => {
      const content = `<template lang="nmbl">
div:md
  # ignored
</template>`;
      const preprocessor = nmblPreprocess({ compiler: { filters: { md: () => 'CUSTOM' } } });
      const result = preprocessor.markup({ content, filename: 'Md.svelte' });
      expect(result!.code).toContain('CUSTOM');
      expect(result!.code).not.toContain('<h1>');
    });
  });

  describe('Svelte control flow: @if / @else', () => {
    test('@if compiles to {#if}...{/if}', () => {
      const content = `<template lang="nmbl">
@if(show)
  p Visible
</template>`;

      const preprocessor = nmblPreprocess();
      const result = preprocessor.markup({ content, filename: 'IfBlock.svelte' });

      expect(result).toBeDefined();
      expect(result!.code).toContain('{#if show}');
      expect(result!.code).toContain('<p>Visible</p>');
      expect(result!.code).toContain('{/if}');
    });

    test('@if/@else compiles to {#if}...{:else}...{/if}', () => {
      const content = `<template lang="nmbl">
@if(loggedIn)
  p Welcome back!
@else
  p Please log in.
</template>`;

      const preprocessor = nmblPreprocess();
      const result = preprocessor.markup({ content, filename: 'IfElse.svelte' });

      expect(result).toBeDefined();
      expect(result!.code).toContain('{#if loggedIn}');
      expect(result!.code).toContain('<p>Welcome back!</p>');
      expect(result!.code).toContain('{:else}');
      expect(result!.code).toContain('<p>Please log in.</p>');
      expect(result!.code).toContain('{/if}');
    });
  });

  describe('dedenting', () => {
    test('strips common leading indent from template body', () => {
      // The template content is indented by 2 spaces — dedent should strip that
      const content = `<template lang="nmbl">
  div.container
    p.text Hello
</template>`;

      const preprocessor = nmblPreprocess();
      const result = preprocessor.markup({ content, filename: 'Dedent.svelte' });

      expect(result).toBeDefined();
      // Should compile correctly despite the indentation
      expect(result!.code).toContain('<div class="container">');
      expect(result!.code).toContain('<p class="text">Hello</p>');
    });

    test('handles deeply indented template (e.g. inside another tag in source)', () => {
      // Simulate a file where the template is heavily indented
      const content = `<template lang="nmbl">
    section.hero
      h1.title Welcome
      p.subtitle Subtitle here
</template>`;

      const preprocessor = nmblPreprocess();
      const result = preprocessor.markup({ content, filename: 'DeepDedent.svelte' });

      expect(result).toBeDefined();
      expect(result!.code).toContain('<section class="hero">');
      expect(result!.code).toContain('<h1 class="title">Welcome</h1>');
      expect(result!.code).toContain('<p class="subtitle">Subtitle here</p>');
    });
  });

  describe('source map validity', () => {
    test('generated source map is version 3', () => {
      const content = `<template lang="nmbl">
div.app
  p.lead Hello
</template>`;
      const preprocessor = nmblPreprocess();
      const result = preprocessor.markup({ content, filename: 'SM.svelte' });

      expect(result).toBeDefined();
      expect(result!.map).toBeDefined();
      expect(result!.map.version).toBe(3);
      expect(result!.map.sources).toContain('SM.svelte');
      expect(result!.map.sourcesContent).toHaveLength(1);
      expect(result!.map.sourcesContent[0]).toBe(content);
    });

    test('a known token (class "lead") maps back to its original line/column', () => {
      // .svelte source:
      //   line 0: <script>
      //   line 1: let x = 1;
      //   line 2: </script>
      //   line 3: <template lang="nmbl">
      //   line 4: div.app
      //   line 5:   p.lead Hello   ← ".lead" starts at col 3
      //   line 6: </template>
      //   line 7: <style>
      //   ...
      const content = `<script>
let x = 1;
</script>
<template lang="nmbl">
div.app
  p.lead Hello
</template>
<style>
.app {}
</style>`;

      const preprocessor = nmblPreprocess();
      const result = preprocessor.markup({ content, filename: 'SourceMap.svelte' });
      expect(result).toBeDefined();

      // Generated output:
      //   line 0: <script>
      //   line 1: let x = 1;
      //   line 2: </script>
      //   line 3: <div class="app">
      //   line 4:   <p class="lead">Hello</p>   ← "lead" at col 12
      //   line 5: </div>
      //   line 6: <style>
      //   ...
      const generated = result!.code;
      const genLines = generated.split('\n');
      const leadGenLine = genLines.findIndex(l => l.includes('"lead"'));
      const leadGenCol = genLines[leadGenLine].indexOf('"lead"') + 1; // col of 'l' in 'lead'

      expect(leadGenLine).toBeGreaterThan(-1);

      const pos = originalPositionFor(result!.map.mappings, leadGenLine, leadGenCol);
      expect(pos).not.toBeNull();

      // ".lead" in NMBL source is at line 5 col 3 (the dot) in the original file
      // The source map segment covering "lead" should point to that neighbourhood.
      // We allow ±2 chars on column for how segment boundaries align.
      const origLeadLine = 5;
      const origLeadCol = 3; // the '.' before 'lead'

      expect(pos!.srcLine).toBe(origLeadLine);
      expect(Math.abs(pos!.srcCol - origLeadCol)).toBeLessThanOrEqual(2);
    });

    test('source map correctly maps lines before the template (identity)', () => {
      const content = `<script>
let x = 1;
</script>
<template lang="nmbl">
div
</template>`;

      const preprocessor = nmblPreprocess();
      const result = preprocessor.markup({ content, filename: 'Identity.svelte' });
      expect(result).toBeDefined();

      // Generated line 1 should be "let x = 1;" — maps to source line 1
      const pos = originalPositionFor(result!.map.mappings, 1, 0);
      expect(pos).not.toBeNull();
      expect(pos!.srcLine).toBe(1);
    });
  });
});
