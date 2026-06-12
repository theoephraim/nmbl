// core.ts — filesystem-aware format/lint logic, kept free of process.exit and
// argument parsing so it can be unit-tested directly.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  formatFile, lint, extractNmblRegions, isSupportedFile,
  type FormatOptions, type LintOptions, type LintMessage, type NmblError,
} from '@nmbl/parser';

/** Directory names never worth walking into. */
const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.turbo', '.next', '.nuxt',
  '.svelte-kit', '.astro', 'coverage', '.cache',
]);

/** Extensions discovered during a directory walk. */
const WALK_EXTENSIONS = ['.nmbl', '.vue', '.svelte', '.astro', '.jsx', '.tsx'];

/**
 * Expand a list of file/directory paths into a concrete list of files NMBL
 * tooling can act on. Explicit file arguments are always included (even `.ts`);
 * directories are walked for the common embedding extensions.
 */
export function collectFiles(paths: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (f: string) => {
    if (!seen.has(f)) { seen.add(f); out.push(f); }
  };
  for (const p of paths) {
    let st;
    try { st = statSync(p); } catch { throw new Error(`No such file or directory: ${p}`); }
    if (st.isDirectory()) {
      for (const f of walkDir(p)) add(f);
    } else if (isSupportedFile(p)) {
      add(p);
    } else {
      // Explicit non-supported file — include anyway; extraction is a no-op.
      add(p);
    }
  }
  return out;
}

function walkDir(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.isDirectory()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      out.push(...walkDir(full));
    } else if (WALK_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

export interface FormatOutcome {
  file: string;
  /** Formatted file content. */
  output: string;
  /** True when the formatted output differs from the input. */
  changed: boolean;
  errors: NmblError[];
  skipped: Array<{ start: number; reason: string }>;
}

export function formatContent(file: string, content: string, options: FormatOptions = {}): FormatOutcome {
  const r = formatFile(content, file, options);
  return { file, output: r.code, changed: r.changed, errors: r.errors, skipped: r.skipped };
}

export interface MappedLintMessage extends LintMessage {
  /** 1-based line in the host file. */
  line: number;
  /** 1-based column. */
  column: number;
}

export interface LintOutcome {
  file: string;
  messages: MappedLintMessage[];
}

/**
 * Lint every NMBL region in a file, mapping diagnostic positions back to host
 * file line/column. Embedded regions are dedented (preserving line count) so
 * the parser sees flush-left NMBL while line numbers stay aligned.
 */
export function lintContent(file: string, content: string, options: LintOptions = {}): LintOutcome {
  const { regions } = extractNmblRegions(content, file);
  const messages: MappedLintMessage[] = [];

  for (const region of regions) {
    if (region.skipReason) continue;
    const regionStartLine = countNewlines(content, region.start);
    const { text, dropped } = dedentPreservingLines(region.content);
    for (const m of lint(text, options)) {
      messages.push({
        ...m,
        line: regionStartLine + m.span.start.line + 1,
        column: m.span.start.column - dropped + 1,
      });
    }
  }

  messages.sort((a, b) => a.line - b.line || a.column - b.column);
  return { file, messages };
}

function countNewlines(s: string, end: number): number {
  let n = 0;
  for (let i = 0; i < end && i < s.length; i++) if (s[i] === '\n') n++;
  return n;
}

// Strip the common leading indentation but keep every line (no trimming) so a
// region's line numbers map cleanly back to the host file.
function dedentPreservingLines(text: string): { text: string; dropped: number } {
  const lines = text.split('\n');
  let min = Infinity;
  for (const l of lines) {
    if (!l.trim()) continue;
    min = Math.min(min, /^[ \t]*/.exec(l)![0].length);
  }
  if (!isFinite(min) || min === 0) return { text, dropped: 0 };
  return { text: lines.map((l) => l.slice(min)).join('\n'), dropped: min };
}

export function readFile(file: string): string {
  return readFileSync(file, 'utf8');
}
