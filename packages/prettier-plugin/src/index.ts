import { format } from '@nmbl-lang/core';
import type { Plugin, Parser, Printer, SupportLanguage } from 'prettier';

// ─── How this plugin wires into Prettier ──────────────────────────────
//
// A Prettier plugin is plumbing between three stages:
//
//   source text ──parse──▶ AST ──print──▶ Doc ──▶ formatted text
//
// NMBL already has a full formatter in @nmbl-lang/core, so we don't build a
// real AST or use Prettier's Doc-builder algebra. Instead we:
//
//   1. parse(): run the NMBL formatter once, stash the result string in a
//      trivial one-node "AST".
//   2. print(): hand that string straight back to Prettier (a plain string
//      is a valid Doc).
//
// locStart/locEnd are required by Prettier's typings but irrelevant here
// since there's only ever one node — we return 0 for both.

/** The single node our "parser" produces. */
interface NmblRootNode {
  type: 'nmbl-root';
  /** Formatted source, WITHOUT a trailing newline (Prettier adds the final one). */
  formatted: string;
  /** True if the formatter reported parse errors (we then pass input through unchanged). */
  hadErrors: boolean;
}

/**
 * Prettier passes options as the 2nd arg in v3 and (historically) the 3rd in
 * v2. We don't depend on positional layout: we read tabWidth/printWidth off
 * whichever argument actually carries them.
 */
function readFormatOptions(
  args: unknown[]
): { indent: number; printWidth: number } {
  let indent = 2;
  let printWidth = 80;
  for (const arg of args) {
    if (arg && typeof arg === 'object') {
      const o = arg as { tabWidth?: number; printWidth?: number };
      if (typeof o.tabWidth === 'number') indent = o.tabWidth;
      if (typeof o.printWidth === 'number') printWidth = o.printWidth;
    }
  }
  return { indent, printWidth };
}

function parse(text: string, ...rest: unknown[]): NmblRootNode {
  const { indent, printWidth } = readFormatOptions(rest);
  const result = format(text, { indent, printWidth });

  // If NMBL couldn't parse the input, the formatter sets `formatted: false`
  // and returns the original source untouched. We mirror that: never mangle
  // unparseable input — emit it verbatim. Stripping the trailing newline keeps
  // things consistent since Prettier always re-adds exactly one.
  const code = result.formatted ? result.code : text;
  return {
    type: 'nmbl-root',
    formatted: code.replace(/\n+$/, ''),
    hadErrors: !result.formatted,
  };
}

export const languages: SupportLanguage[] = [
  {
    name: 'NMBL',
    parsers: ['nmbl'],
    extensions: ['.nmbl'],
    vscodeLanguageIds: ['nmbl'],
  },
];

export const parsers: Record<string, Parser<NmblRootNode>> = {
  nmbl: {
    parse,
    astFormat: 'nmbl',
    locStart: () => 0,
    locEnd: () => 0,
  },
};

export const printers: Record<string, Printer<NmblRootNode>> = {
  nmbl: {
    // A plain string is a valid Prettier Doc. Unlike Prettier's built-in
    // printers, a bare-string Doc does NOT get a trailing newline added for us,
    // so we own it: `formatted` is stored without one and we append exactly one
    // here. We strip any leading/trailing blank lines first to guarantee a
    // single final newline regardless of input.
    print(path) {
      return path.getValue().formatted + '\n';
    },
  },
};

const plugin: Plugin<NmblRootNode> = { languages, parsers, printers };
export default plugin;
