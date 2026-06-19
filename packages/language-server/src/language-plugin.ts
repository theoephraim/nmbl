import type { CodeMapping, IScriptSnapshot, LanguagePlugin, VirtualCode } from '@volar/language-core';
import { compile, lint } from '@nmbl-lang/core';
import type { SourceMapping, LintMessage } from '@nmbl-lang/core';
import { URI } from 'vscode-uri';

// ---------------------------------------------------------------------------
// Regex to detect <template lang="nmbl"> in host documents
// ---------------------------------------------------------------------------
const NMBL_TEMPLATE_RE = /<template[^>]*\blang=(["'])nmbl\1[^>]*>([\s\S]*?)<\/template>/;

// ---------------------------------------------------------------------------
// Dedent helpers
// ---------------------------------------------------------------------------

/**
 * Given a multi-line region body (the text INSIDE the template tag), compute
 * the minimum indentation (number of leading spaces) of any non-empty line and
 * return:
 *   - `dedented`: the text with that many spaces stripped from each line
 *   - `lineStartOffsets`: for each line i of the ORIGINAL region text, the
 *     absolute offset (relative to start of `regionText`) where that line
 *     begins in the ORIGINAL text. This lets us map back from a dedented offset
 *     to the original offset.
 *   - `indent`: the number of spaces stripped per line
 */
export function dedentRegion(regionText: string): {
  dedented: string;
  indent: number;
  /** origLineStartOffsets[i] = offset of line i in the original regionText */
  origLineStartOffsets: number[];
} {
  const lines = regionText.split('\n');

  // Build original line start offsets
  const origLineStartOffsets: number[] = [];
  let off = 0;
  for (const line of lines) {
    origLineStartOffsets.push(off);
    off += line.length + 1; // +1 for the '\n' we split on
  }

  // Find minimum indentation of non-empty lines
  let indent = Infinity;
  for (const line of lines) {
    if (line.trim() === '') continue;
    const leading = line.match(/^( *)/)?.[1].length ?? 0;
    if (leading < indent) indent = leading;
  }
  if (!isFinite(indent)) indent = 0;

  const dedented = lines
    .map((line) => (line.trim() === '' ? '' : line.slice(indent)))
    .join('\n');

  return { dedented, indent, origLineStartOffsets };
}

/**
 * Convert an offset in the DEDENTED text back to an offset in the ORIGINAL
 * region text (not the host document — add regionStart separately).
 *
 * Uses the precomputed origLineStartOffsets table so this is O(n_lines) once,
 * then O(1) per lookup via a linear scan (fine for the typical number of
 * mappings).
 */
export function dedentedOffsetToOriginal(
  dedentedOffset: number,
  dedentedText: string,
  origLineStartOffsets: number[],
  indent: number,
): number {
  // Figure out which line and column the dedented offset falls on
  let line = 0;
  let col = 0;
  for (let i = 0; i < dedentedOffset; i++) {
    if (dedentedText[i] === '\n') {
      line++;
      col = 0;
    } else {
      col++;
    }
  }
  // The original offset = start of that line in original + indent + col
  const origLineStart = origLineStartOffsets[line] ?? 0;
  return origLineStart + indent + col;
}

/**
 * Run the NMBL linter, swallowing any throw — diagnostics must never crash the
 * server, and a malformed in-progress document can make the parser unhappy.
 */
function safeLint(source: string): LintMessage[] {
  try {
    return lint(source);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Mapping conversion
// ---------------------------------------------------------------------------

/**
 * Convert a SourceMapping[] from @nmbl-lang/core into Volar CodeMapping[].
 *
 * Volar mappings require source and generated segment lengths to be equal
 * (it maps one character range to another of the same length). When the source
 * and generated spans differ in length, we use the minimum length so both sides
 * stay in-bounds and a reasonable subset of the text is mapped.
 *
 * @param regionStart - If the NMBL source was extracted from a host document,
 *   pass the byte offset of the region's first character in that document.
 *   All sourceOffsets will be shifted by this amount. Pass 0 for standalone .nmbl.
 * @param dedentedText - The dedented NMBL text that was compiled (needed for
 *   offset back-conversion).
 * @param origLineStartOffsets - Table from dedentRegion().
 * @param indent - Number of spaces stripped per line from dedentRegion().
 */
export function convertMappings(
  mappings: SourceMapping[],
  regionStart = 0,
  dedentedText?: string,
  origLineStartOffsets?: number[],
  indent = 0,
): CodeMapping[] {
  const result: CodeMapping[] = [];

  for (const m of mappings) {
    const generatedStart = m.generatedSpan.start.offset;
    const generatedEnd = m.generatedSpan.end.offset;
    const generatedLen = generatedEnd - generatedStart;
    if (generatedLen <= 0) continue;

    // The parser's sourceSpan offsets are into the dedented text. We must
    // convert them back to the original host-document offsets.
    let sourceStart: number;
    let sourceEnd: number;

    if (dedentedText && origLineStartOffsets && indent > 0) {
      sourceStart =
        regionStart +
        dedentedOffsetToOriginal(
          m.sourceSpan.start.offset,
          dedentedText,
          origLineStartOffsets,
          indent,
        );
      sourceEnd =
        regionStart +
        dedentedOffsetToOriginal(
          m.sourceSpan.end.offset,
          dedentedText,
          origLineStartOffsets,
          indent,
        );
    } else {
      sourceStart = regionStart + m.sourceSpan.start.offset;
      sourceEnd = regionStart + m.sourceSpan.end.offset;
    }

    const sourceLen = sourceEnd - sourceStart;
    if (sourceLen <= 0) continue;

    const length = Math.min(sourceLen, generatedLen);

    result.push({
      sourceOffsets: [sourceStart],
      generatedOffsets: [generatedStart],
      lengths: [length],
      data: {
        completion: true,
        semantic: true,
        navigation: true,
        structure: true,
        format: false,
        verification: true,
      },
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// VirtualCode classes
// ---------------------------------------------------------------------------

/**
 * The root VirtualCode for an .nmbl file.
 *
 * It holds the original NMBL snapshot plus one embedded 'html' virtual code
 * that is the compiled HTML output with position mappings back to the NMBL
 * source.
 */
export class NmblVirtualCode implements VirtualCode {
  id = 'root';
  languageId = 'nmbl';

  /** Compile errors from @nmbl-lang/core — surfaced as diagnostics by the server. */
  compileErrors: ReturnType<typeof compile>['errors'];
  /** Linter findings from @nmbl-lang/core — surfaced as diagnostics by the server. */
  lintMessages: LintMessage[];

  mappings: CodeMapping[];
  embeddedCodes: VirtualCode[];

  constructor(public snapshot: IScriptSnapshot) {
    const source = snapshot.getText(0, snapshot.getLength());

    // Compile NMBL → HTML.  Never throw — always produce best-effort output.
    const { html, mappings: sourceMappings, errors } = compile(source, { framework: 'html' });

    this.compileErrors = errors;
    // Lint operates on the raw source, so its spans are already 1:1 with the
    // document — no remapping needed for the standalone .nmbl case.
    this.lintMessages = safeLint(source);

    // The root virtual code covers the entire NMBL source 1:1 (used for
    // features like document symbols that operate on the raw source).
    this.mappings = [{
      sourceOffsets: [0],
      generatedOffsets: [0],
      lengths: [source.length],
      data: {
        completion: true,
        semantic: true,
        navigation: true,
        structure: true,
        format: false,
        verification: true,
      },
    }];

    // Build a snapshot for the generated HTML
    const htmlSnapshot: IScriptSnapshot = {
      getText: (start, end) => html.substring(start, end),
      getLength: () => html.length,
      getChangeRange: () => undefined,
    };

    // Convert source mappings to Volar CodeMappings
    const codeMappings = convertMappings(sourceMappings);

    this.embeddedCodes = [
      {
        id: 'html',
        languageId: 'html',
        snapshot: htmlSnapshot,
        mappings: codeMappings,
        embeddedCodes: [],
      },
    ];
  }
}

/**
 * VirtualCode for a host document (.svelte or .astro) that contains a
 * `<template lang="nmbl">` region.
 *
 * The root virtual code represents the NMBL region with a single mapping that
 * covers the region in the host document. One embedded 'html' virtual code
 * holds the compiled HTML output, with mappings whose sourceOffsets point at
 * the original host-document positions.
 */
export class NmblHostVirtualCode implements VirtualCode {
  id = 'root';
  languageId = 'nmbl';

  compileErrors: ReturnType<typeof compile>['errors'];
  lintMessages: LintMessage[];
  mappings: CodeMapping[];
  embeddedCodes: VirtualCode[];

  /** The region's character range in the host document. */
  readonly regionStart: number;
  readonly regionLength: number;

  /** The host framework (stored so updateVirtualCode can re-use it). */
  readonly framework: 'svelte' | 'astro';

  constructor(
    public snapshot: IScriptSnapshot,
    framework: 'svelte' | 'astro',
  ) {
    this.framework = framework;
    const hostText = snapshot.getText(0, snapshot.getLength());

    const match = NMBL_TEMPLATE_RE.exec(hostText);
    if (!match) {
      // Should not happen — callers check for match first. Return empty.
      this.compileErrors = [];
      this.lintMessages = [];
      this.mappings = [];
      this.embeddedCodes = [];
      this.regionStart = 0;
      this.regionLength = 0;
      return;
    }

    // match.index = start of <template ..., match[0] = full tag text
    // match[2] = the body INSIDE the tag (after the '>' and before '</template>')
    const fullMatchStart = match.index;
    const fullMatchText = match[0];

    // Find where the body starts: after the opening tag '>'
    const openTagEnd = fullMatchText.indexOf('>') + 1;
    const bodyStart = fullMatchStart + openTagEnd;
    const regionText = match[2]; // body only

    this.regionStart = bodyStart;
    this.regionLength = regionText.length;

    // Dedent the body so the parser sees column-0 roots
    const { dedented, indent, origLineStartOffsets } = dedentRegion(regionText);

    // Compile the dedented NMBL text
    const { html, mappings: sourceMappings, errors } = compile(dedented, { framework });

    this.compileErrors = errors.map((err) => {
      // Shift error spans from dedented-space back to host-document space
      if (!err.span) return err;
      const origStart =
        this.regionStart +
        dedentedOffsetToOriginal(
          err.span.start.offset,
          dedented,
          origLineStartOffsets,
          indent,
        );
      const origEnd =
        this.regionStart +
        dedentedOffsetToOriginal(
          err.span.end.offset,
          dedented,
          origLineStartOffsets,
          indent,
        );
      return {
        ...err,
        span: {
          start: { ...err.span.start, offset: origStart },
          end: { ...err.span.end, offset: origEnd },
        },
      };
    });

    // Lint the dedented region, then shift each finding's span from
    // dedented-space back to host-document space (mirrors compileErrors above).
    this.lintMessages = safeLint(dedented).map((msg) => {
      const origStart =
        this.regionStart +
        dedentedOffsetToOriginal(msg.span.start.offset, dedented, origLineStartOffsets, indent);
      const origEnd =
        this.regionStart +
        dedentedOffsetToOriginal(msg.span.end.offset, dedented, origLineStartOffsets, indent);
      return {
        ...msg,
        span: {
          start: { ...msg.span.start, offset: origStart },
          end: { ...msg.span.end, offset: origEnd },
        },
      };
    });

    // Root mapping covers the NMBL region in the host document 1:1
    this.mappings = [{
      sourceOffsets: [bodyStart],
      generatedOffsets: [0],
      lengths: [regionText.length],
      data: {
        completion: true,
        semantic: true,
        navigation: true,
        structure: true,
        format: false,
        verification: true,
      },
    }];

    // Build embedded HTML virtual code with host-document-relative source offsets
    const codeMappings = convertMappings(
      sourceMappings,
      bodyStart,
      dedented,
      origLineStartOffsets,
      indent,
    );

    const htmlSnapshot: IScriptSnapshot = {
      getText: (start, end) => html.substring(start, end),
      getLength: () => html.length,
      getChangeRange: () => undefined,
    };

    this.embeddedCodes = [
      {
        id: 'html',
        languageId: 'html',
        snapshot: htmlSnapshot,
        mappings: codeMappings,
        embeddedCodes: [],
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Language plugin
// ---------------------------------------------------------------------------

function getHostFramework(languageId: string): 'svelte' | 'astro' | null {
  if (languageId === 'svelte') return 'svelte';
  if (languageId === 'astro') return 'astro';
  return null;
}

/**
 * The Volar LanguagePlugin<URI> for .nmbl files and host documents that embed
 * NMBL via `<template lang="nmbl">`.
 */
export const nmblLanguagePlugin: LanguagePlugin<URI> = {
  getLanguageId(uri) {
    if (uri.path.endsWith('.nmbl')) {
      return 'nmbl';
    }
    return undefined;
  },

  createVirtualCode(_uri, languageId, snapshot) {
    if (languageId === 'nmbl') {
      return new NmblVirtualCode(snapshot);
    }

    const framework = getHostFramework(languageId);
    if (framework) {
      // Only create a virtual code if the document has an nmbl template region
      const text = snapshot.getText(0, snapshot.getLength());
      if (NMBL_TEMPLATE_RE.test(text)) {
        return new NmblHostVirtualCode(snapshot, framework);
      }
    }

    return undefined;
  },

  updateVirtualCode(_uri, virtualCode, newSnapshot) {
    if (virtualCode instanceof NmblVirtualCode) {
      return new NmblVirtualCode(newSnapshot);
    }
    if (virtualCode instanceof NmblHostVirtualCode) {
      const text = newSnapshot.getText(0, newSnapshot.getLength());
      if (!NMBL_TEMPLATE_RE.test(text)) return undefined;
      return new NmblHostVirtualCode(newSnapshot, virtualCode.framework);
    }
    return undefined;
  },
};
