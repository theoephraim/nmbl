// embedded.ts — locate NMBL inside the files real projects actually have.
//
// NMBL rarely lives alone: it shows up as `<template lang="nmbl">` blocks in
// Vue/Svelte/Astro single-file components and as nmbl`…` tagged templates in
// JSX. The formatter and linter need to find those regions, operate on the
// NMBL inside, and splice the result back without disturbing the host file.
//
// This module is intentionally dependency-free (regex + a small hand-written
// scanner) so it stays inside @nmbl/parser alongside the parser itself.
import { format, type FormatOptions, type FormatResult } from './formatter.js';
import type { NmblError } from './errors.js';

export type Framework = 'html' | 'vue' | 'svelte' | 'astro' | 'jsx';

export interface NmblRegion {
  /** Raw NMBL text of the region (with its original host indentation). */
  content: string;
  /** Offset in the host file where `content` begins (inclusive). */
  start: number;
  /** Offset in the host file where `content` ends (exclusive). */
  end: number;
  /** Indentation of the construct that introduces the region. */
  baseIndent: string;
  /** How the region is embedded — drives write-back shaping. */
  kind: 'whole-file' | 'template-block' | 'tagged-template';
  /**
   * Set when the region can't be safely reformatted (e.g. a nmbl`…` template
   * with ${…} holes). Tools should leave it untouched.
   */
  skipReason?: string;
}

export interface ExtractResult {
  framework: Framework;
  regions: NmblRegion[];
}

const EXT_FRAMEWORK: Record<string, Framework> = {
  nmbl: 'html',
  vue: 'vue',
  svelte: 'svelte',
  astro: 'astro',
  jsx: 'jsx',
  tsx: 'jsx',
  js: 'jsx',
  ts: 'jsx',
  mjs: 'jsx',
  cjs: 'jsx',
};

function extOf(filename: string): string {
  const m = /\.([a-z]+)$/i.exec(filename);
  return m ? m[1].toLowerCase() : '';
}

/** True when this file type could contain NMBL the tools can act on. */
export function isSupportedFile(filename: string): boolean {
  return extOf(filename) in EXT_FRAMEWORK;
}

/**
 * Find every NMBL region in `source` for the given filename.
 *
 * `.nmbl` files are a single whole-file region. SFCs return one region per
 * `<template lang="nmbl">` block. JSX files return one region per nmbl`…`
 * tagged template (with `skipReason` set when ${…} holes make it unsafe).
 */
export function extractNmblRegions(source: string, filename: string): ExtractResult {
  const ext = extOf(filename);
  const framework = EXT_FRAMEWORK[ext] ?? 'html';

  if (ext === 'nmbl') {
    return {
      framework,
      regions: [{ content: source, start: 0, end: source.length, baseIndent: '', kind: 'whole-file' }],
    };
  }

  if (framework === 'vue' || framework === 'svelte' || framework === 'astro') {
    return { framework, regions: findTemplateBlocks(source) };
  }

  if (framework === 'jsx') {
    return { framework, regions: findTaggedTemplates(source) };
  }

  return { framework, regions: [] };
}

// ── <template lang="nmbl"> … </template> ──────────────────────────────────
const TEMPLATE_RE = /(<template\b[^>]*\blang=(["'])nmbl\2[^>]*>)([\s\S]*?)(<\/template>)/gi;

function findTemplateBlocks(source: string): NmblRegion[] {
  const regions: NmblRegion[] = [];
  let m: RegExpExecArray | null;
  TEMPLATE_RE.lastIndex = 0;
  while ((m = TEMPLATE_RE.exec(source)) !== null) {
    const openTag = m[1];
    const inner = m[3];
    const contentStart = m.index + openTag.length;
    const contentEnd = contentStart + inner.length;
    regions.push({
      content: inner,
      start: contentStart,
      end: contentEnd,
      baseIndent: lineIndentAt(source, m.index),
      kind: 'template-block',
    });
  }
  return regions;
}

// ── nmbl`…` tagged templates ──────────────────────────────────────────────
function findTaggedTemplates(source: string): NmblRegion[] {
  const regions: NmblRegion[] = [];
  const len = source.length;
  let i = 0;
  // Lightweight scanner: skip strings/comments/other templates so a nmbl` we
  // find is genuinely code, then capture the body up to the matching backtick.
  type Mode = 'code' | 'line' | 'block' | 'dq' | 'sq' | 'tmpl';
  let mode: Mode = 'code';
  while (i < len) {
    const ch = source[i];
    if (mode === 'line') { if (ch === '\n') mode = 'code'; i++; continue; }
    if (mode === 'block') { if (ch === '*' && source[i + 1] === '/') { mode = 'code'; i += 2; } else i++; continue; }
    if (mode === 'dq') { if (ch === '\\') i += 2; else { if (ch === '"') mode = 'code'; i++; } continue; }
    if (mode === 'sq') { if (ch === '\\') i += 2; else { if (ch === "'") mode = 'code'; i++; } continue; }
    if (mode === 'tmpl') {
      if (ch === '\\') { i += 2; continue; }
      if (ch === '`') { mode = 'code'; i++; continue; }
      i++; continue;
    }
    // code mode
    if (ch === '/' && source[i + 1] === '/') { mode = 'line'; i += 2; continue; }
    if (ch === '/' && source[i + 1] === '*') { mode = 'block'; i += 2; continue; }
    if (ch === '"') { mode = 'dq'; i++; continue; }
    if (ch === "'") { mode = 'sq'; i++; continue; }
    if (ch === 'n' && source.startsWith('nmbl`', i) && !/[A-Za-z0-9_$.]/.test(source[i - 1] ?? '')) {
      const bodyStart = i + 5;
      const region = captureTemplateBody(source, bodyStart);
      if (region) {
        regions.push({
          content: source.slice(bodyStart, region.end),
          start: bodyStart,
          end: region.end,
          baseIndent: lineIndentAt(source, i),
          kind: 'tagged-template',
          skipReason: region.hasHoles ? 'contains ${…} interpolations' : undefined,
        });
        i = region.end + 1; // skip past closing backtick
        continue;
      }
    }
    if (ch === '`') { mode = 'tmpl'; i++; continue; }
    i++;
  }
  return regions;
}

// From just past the opening backtick, find the matching close, noting holes.
function captureTemplateBody(source: string, start: number): { end: number; hasHoles: boolean } | null {
  let i = start;
  let hasHoles = false;
  const len = source.length;
  while (i < len) {
    const ch = source[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch === '`') return { end: i, hasHoles };
    if (ch === '$' && source[i + 1] === '{') {
      hasHoles = true;
      // skip balanced braces
      let depth = 1; i += 2;
      while (i < len && depth > 0) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') depth--;
        i++;
      }
      continue;
    }
    i++;
  }
  return null; // unterminated
}

// ── Shared helpers ─────────────────────────────────────────────────────────

/** Indentation (leading whitespace) of the line containing `offset`. */
function lineIndentAt(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
  const m = /^[ \t]*/.exec(source.slice(lineStart, offset));
  return m ? m[0] : '';
}

function commonIndent(text: string): string {
  let min = Infinity;
  let unit = ' ';
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const m = /^[ \t]*/.exec(line)![0];
    if (m.length < min) { min = m.length; unit = m[0] || ' '; }
  }
  return isFinite(min) ? unit.repeat(min) : '';
}

function dedentBody(text: string): string {
  const indent = commonIndent(text);
  if (!indent) return text;
  return text
    .split('\n')
    .map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l.replace(/^[ \t]+/, '')))
    .join('\n');
}

export interface FormatFileResult {
  /** New file content (unchanged if nothing was formatted). */
  code: string;
  /** True when at least one region was reformatted and differs from input. */
  changed: boolean;
  /** Parse errors across all regions. */
  errors: NmblError[];
  /** Regions skipped, with the reason. */
  skipped: Array<{ start: number; reason: string }>;
}

/**
 * Format every NMBL region in a file and return the rewritten file content.
 *
 * Whole-file `.nmbl` is formatted directly. Embedded regions are dedented,
 * formatted, then re-indented one level under the construct that introduces
 * them, leaving the host file's surrounding code untouched.
 */
export function formatFile(source: string, filename: string, options: FormatOptions = {}): FormatFileResult {
  const { framework, regions } = extractNmblRegions(source, filename);
  const errors: NmblError[] = [];
  const skipped: Array<{ start: number; reason: string }> = [];
  // Emit target-idiomatic `@each` (Svelte's `as` form in .svelte files, the
  // portable `of` form everywhere else).
  const fmtOptions: FormatOptions = { ...options, framework };

  if (regions.length === 0) {
    return { code: source, changed: false, errors, skipped };
  }

  // Whole-file mode is a straight format.
  if (regions[0].kind === 'whole-file') {
    const r = format(source, fmtOptions);
    errors.push(...r.errors);
    return { code: r.code, changed: r.code !== source, errors, skipped };
  }

  const indentUnit = ' '.repeat(options.indent ?? 2);
  // Rebuild the file left-to-right, replacing each region's inner content.
  let out = '';
  let cursor = 0;
  let changed = false;
  for (const region of regions) {
    out += source.slice(cursor, region.start);
    cursor = region.end;

    if (region.skipReason) {
      skipped.push({ start: region.start, reason: region.skipReason });
      out += region.content;
      continue;
    }

    const dedented = dedentBody(region.content).trim();
    const r: FormatResult = format(dedented, fmtOptions);
    if (!r.formatted) {
      errors.push(...r.errors);
      out += region.content; // never corrupt unparseable regions
      continue;
    }

    const innerIndent = region.baseIndent + indentUnit;
    const reindented = r.code
      .replace(/\n$/, '')
      .split('\n')
      .map((l) => (l ? innerIndent + l : ''))
      .join('\n');

    const replacement = '\n' + reindented + '\n' + region.baseIndent;
    if (replacement !== region.content) changed = true;
    out += replacement;
  }
  out += source.slice(cursor);

  return { code: out, changed, errors, skipped };
}
