// comments.ts — recover trivia comments from source.
//
// The parser never sees silent comments: comment-only `// …` lines are
// skipped by the indent machinery and trailing / attr-list comments are
// `skip` tokens. That is the right model for PARSING — but tools that
// re-emit NMBL (a formatter, codemods) need every comment back.
//
// The recovery invariant: after lexing, the GAPS between retained token
// spans contain only whitespace and swallowed comments — strings, raw
// content blocks, and text are all single retained tokens, so a `//` inside
// them can never leak into a gap. Recovery is therefore: tokenize, walk the
// gaps, extract the non-whitespace runs.
import { tokenizeSource } from './cst-to-ast.js';

export interface RecoveredComment {
  /** Verbatim comment text including delimiters (`// …`, `/* … *​/`). */
  text: string;
  offset: number;
  end: number;
  kind: 'line' | 'block';
}

export function recoverComments(source: string): RecoveredComment[] {
  const tokens = tokenizeSource(source);
  const out: RecoveredComment[] = [];

  let gapStart = 0;
  for (let i = 0; i <= tokens.length; i++) {
    const gapEnd = i < tokens.length ? tokens[i].offset : source.length;
    if (gapEnd > gapStart) scanGap(source, gapStart, gapEnd, out);
    if (i < tokens.length) {
      gapStart = Math.max(gapStart, tokens[i].offset + tokens[i].text.length);
    }
  }
  return out;
}

// A gap contains only whitespace and comments; comments start at `//` or
// `/*` (rendered variants `//!` / `/*!` are retained tokens and never land
// in gaps).
function scanGap(source: string, start: number, end: number, out: RecoveredComment[]): void {
  let i = start;
  while (i < end) {
    const ch = source[i];
    if (ch === '/' && source[i + 1] === '/') {
      let e = i;
      while (e < end && source[e] !== '\n') e++;
      out.push({ text: source.slice(i, e), offset: i, end: e, kind: 'line' });
      i = e;
    } else if (ch === '/' && source[i + 1] === '*') {
      let e = source.indexOf('*/', i + 2);
      e = e < 0 || e + 2 > end ? end : e + 2;
      out.push({ text: source.slice(i, e), offset: i, end: e, kind: 'block' });
      i = e;
    } else {
      i++;
    }
  }
}
