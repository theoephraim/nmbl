import { compile, type CompilerOptions, type SourceMapping } from '@nmbl/parser';

function dedent(text: string): { text: string; indent: number; leadingNewlines: number } {
  // Count and strip leading newlines
  const leadingMatch = text.match(/^(\n+)/);
  const leadingNewlines = leadingMatch ? leadingMatch[1].length : 0;

  // Strip leading/trailing blank lines
  const lines = text.replace(/^\n+/, '').replace(/\s+$/, '').split('\n');
  const minIndent = lines
    .filter(l => l.trim().length > 0)
    .reduce((min, l) => {
      const indent = l.match(/^(\s*)/)?.[1].length ?? 0;
      return Math.min(min, indent);
    }, Infinity);
  if (!isFinite(minIndent) || minIndent === 0) return { text: lines.join('\n'), indent: 0, leadingNewlines };
  return { text: lines.map(l => l.slice(minIndent)).join('\n'), indent: minIndent, leadingNewlines };
}

// ─── VLQ Source Map Encoding ──────────────────────

const VLQ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function vlqEncode(value: number): string {
  let vlq = value < 0 ? ((-value) << 1) + 1 : value << 1;
  let encoded = '';
  do {
    let digit = vlq & 0x1f;
    vlq >>>= 5;
    if (vlq > 0) digit |= 0x20;
    encoded += VLQ_CHARS[digit];
  } while (vlq > 0);
  return encoded;
}

interface SourceMapV3 {
  version: 3;
  file?: string;
  sources: string[];
  sourcesContent: (string | null)[];
  names: string[];
  mappings: string;
}

/**
 * Build a V3 source map for the preprocessor output.
 *
 * The output file is the original .svelte file with the template block replaced by HTML.
 * We need to map:
 * - Lines before/after the template block → identity (same position in source)
 * - Lines within the HTML → back to NMBL source positions using compiler mappings
 */
function buildSourceMap(
  originalContent: string,
  outputContent: string,
  /** Offset in originalContent where the full match starts (e.g. <template lang="nmbl">) */
  matchStart: number,
  /** Offset in originalContent where the full match ends (e.g. </template>) */
  matchEnd: number,
  /** Offset in originalContent where the NMBL content starts (inside the template tag) */
  nmblContentStart: number,
  /** Number of leading newlines stripped from the inner content */
  leadingNewlines: number,
  /** The dedent amount applied to the NMBL source */
  dedentAmount: number,
  /** Source mappings from the NMBL compiler (positions relative to dedented NMBL source) */
  compilerMappings: SourceMapping[],
  filename?: string,
): SourceMapV3 {
  const sourceFile = filename || 'input.svelte';
  const outputLines = outputContent.split('\n');

  // Calculate the line/col where the match starts in the original file
  let matchStartLine = 0;
  let matchStartCol = 0;
  for (let i = 0; i < matchStart && i < originalContent.length; i++) {
    if (originalContent[i] === '\n') {
      matchStartLine++;
      matchStartCol = 0;
    } else {
      matchStartCol++;
    }
  }

  // Calculate the line where the actual NMBL content starts in the original file
  // (accounting for leading newlines that were stripped by dedent)
  let nmblStartLine = 0;
  for (let i = 0; i < nmblContentStart && i < originalContent.length; i++) {
    if (originalContent[i] === '\n') nmblStartLine++;
  }
  nmblStartLine += leadingNewlines;

  // Calculate where the match ends in the original file
  let matchEndLine = 0;
  for (let i = 0; i < matchEnd && i < originalContent.length; i++) {
    if (originalContent[i] === '\n') matchEndLine++;
  }

  // Calculate where the HTML replacement starts and ends in the output
  // The HTML replaces the full match (from matchStart to matchEnd)
  let htmlStartLine = matchStartLine; // HTML starts at the same line as the match
  const htmlContent = outputContent.substring(matchStart, matchStart + (outputContent.length - originalContent.length + (matchEnd - matchStart)));
  let htmlLineCount = 0;
  for (const ch of htmlContent) {
    if (ch === '\n') htmlLineCount++;
  }
  const htmlEndLine = htmlStartLine + htmlLineCount;

  // Build mappings string
  const mappingLines: string[] = [];

  // State for relative encoding
  let prevGenCol = 0;
  let prevSourceLine = 0;
  let prevSourceCol = 0;
  // source index is always 0

  for (let outLine = 0; outLine < outputLines.length; outLine++) {
    // Generated column resets to 0 at the start of each line in V3 source maps
    prevGenCol = 0;

    if (outLine < htmlStartLine || outLine > htmlEndLine) {
      // Outside the template block: identity mapping
      // Map col 0 of this output line to the corresponding source line
      let sourceLine: number;
      if (outLine < htmlStartLine) {
        sourceLine = outLine;
      } else {
        // After the HTML block: offset by the difference in line counts
        const lineShift = matchEndLine - htmlEndLine;
        sourceLine = outLine + lineShift;
      }

      const segments: string[] = [];
      // Segment: [genCol, sourceIdx, sourceLine, sourceCol]
      const genCol = 0 - prevGenCol;
      const srcIdx = 0; // always source 0, relative to prev (which is also always 0)
      const srcLine = sourceLine - prevSourceLine;
      const srcCol = 0 - prevSourceCol;

      segments.push(vlqEncode(genCol) + vlqEncode(srcIdx) + vlqEncode(srcLine) + vlqEncode(srcCol));

      prevGenCol = 0;
      prevSourceLine = sourceLine;
      prevSourceCol = 0;

      mappingLines.push(segments.join(','));
    } else {
      // Inside the HTML block: use compiler mappings for this line
      const htmlLineIndex = outLine - htmlStartLine;

      // Find all compiler mappings whose generated position is on this line
      const lineSegments: { genCol: number; srcLine: number; srcCol: number }[] = [];

      for (const mapping of compilerMappings) {
        if (mapping.generatedSpan.start.line === htmlLineIndex) {
          // Adjust source positions: compiler mappings are relative to dedented NMBL,
          // we need positions in the original file
          const srcLine = nmblStartLine + mapping.sourceSpan.start.line;
          const srcCol = mapping.sourceSpan.start.column + dedentAmount;

          lineSegments.push({
            genCol: mapping.generatedSpan.start.column,
            srcLine,
            srcCol,
          });
        }
      }

      // Sort by generated column
      lineSegments.sort((a, b) => a.genCol - b.genCol);

      // Deduplicate by genCol (keep first)
      const seen = new Set<number>();
      const deduped = lineSegments.filter(s => {
        if (seen.has(s.genCol)) return false;
        seen.add(s.genCol);
        return true;
      });

      if (deduped.length === 0) {
        // No mappings for this line — map to the NMBL start as fallback
        const genCol = 0 - prevGenCol;
        const srcLine = nmblStartLine - prevSourceLine;
        const srcCol = 0 - prevSourceCol;
        mappingLines.push(vlqEncode(genCol) + vlqEncode(0) + vlqEncode(srcLine) + vlqEncode(srcCol));
        prevGenCol = 0;
        prevSourceLine = nmblStartLine;
        prevSourceCol = 0;
      } else {
        const segments: string[] = [];
        for (const seg of deduped) {
          const genCol = seg.genCol - prevGenCol;
          const srcLine = seg.srcLine - prevSourceLine;
          const srcCol = seg.srcCol - prevSourceCol;
          segments.push(vlqEncode(genCol) + vlqEncode(0) + vlqEncode(srcLine) + vlqEncode(srcCol));
          prevGenCol = seg.genCol;
          prevSourceLine = seg.srcLine;
          prevSourceCol = seg.srcCol;
        }
        mappingLines.push(segments.join(','));
      }
    }
  }

  return {
    version: 3,
    file: sourceFile,
    sources: [sourceFile],
    sourcesContent: [originalContent],
    names: [],
    mappings: mappingLines.join(';'),
  };
}

export interface NmblPreprocessOptions {
  /** Options passed to the NMBL compiler */
  compiler?: Omit<CompilerOptions, 'framework'>;
}

/**
 * Svelte preprocessor that compiles `<template lang="nmbl">` blocks.
 */
export function nmblPreprocess(options: NmblPreprocessOptions = {}) {
  return {
    name: 'nmbl',
    markup({ content, filename }: { content: string; filename?: string }) {
      // Support both <template lang="nmbl"> and <!-- nmbl --> syntaxes
      const templateRegex = /<template\s+lang="nmbl"\s*>([\s\S]*?)<\/template>/;
      const commentRegex = /<!--\s*nmbl\s*\n([\s\S]*?)-->/;

      let match = content.match(templateRegex);
      let isCommentSyntax = false;

      if (!match) {
        match = content.match(commentRegex);
        isCommentSyntax = true;
        if (!match) return;
      }

      const matchStart = match.index!;
      const matchEnd = matchStart + match[0].length;
      const innerContent = match[1];
      const innerContentStart = matchStart + match[0].indexOf(innerContent);

      const { text: nmblSource, indent: dedentAmount, leadingNewlines } = dedent(innerContent);
      const { html, mappings, errors } = compile(nmblSource, {
        ...options.compiler,
        framework: 'svelte',
        filename,
      });

      if (errors.length > 0) {
        console.warn(`[nmbl] Warnings in ${filename ?? 'unknown'}:`);
        for (const e of errors) {
          console.warn(`  ${e.message}`);
        }
      }

      const code = content.substring(0, matchStart) + html + content.substring(matchEnd);

      const map = buildSourceMap(
        content,
        code,
        matchStart,
        matchEnd,
        innerContentStart,
        leadingNewlines,
        dedentAmount,
        mappings,
        filename,
      );

      return { code, map };
    },
  };
}
