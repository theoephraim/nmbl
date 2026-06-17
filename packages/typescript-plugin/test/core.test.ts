import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import {
  collectNmblIdentifiers,
  shouldFilterUnusedDiagnostic,
  filterUnusedDiagnostics,
  UNUSED_CODES,
} from '../src/core';

function parse(text: string, fileName = '/test.tsx'): ts.SourceFile {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

describe('collectNmblIdentifiers', () => {
  it('collects component tags and words from a no-substitution template', () => {
    const sf = parse('const x = nmbl`\n  div\n    Badge(text="hi")\n    VButton\n`;');
    const idents = collectNmblIdentifiers(ts, sf);
    expect(idents.has('Badge')).toBe(true);
    expect(idents.has('VButton')).toBe(true);
    expect(idents.has('div')).toBe(true);
  });

  it('collects from the literal chunks of a template WITH substitutions', () => {
    const sf = parse(
      'const x = nmbl`\n  h1 ${title}\n  Badge(color="blue")\n  @if(${show})\n    Sidebar\n`;',
    );
    const idents = collectNmblIdentifiers(ts, sf);
    expect(idents.has('Badge')).toBe(true);
    expect(idents.has('Sidebar')).toBe(true);
    // `title`/`show` live inside ${...} — real AST nodes TS already sees, so we
    // do NOT need them in the set (and we don't scan substitution exprs).
  });

  it('ignores templates tagged with something other than `nmbl`', () => {
    const sf = parse('const x = html`<Badge/>`;');
    expect(collectNmblIdentifiers(ts, sf).has('Badge')).toBe(false);
  });

  it('honours a custom tag name', () => {
    const sf = parse('const x = tmpl`\n  Badge\n`;');
    expect(collectNmblIdentifiers(ts, sf, 'tmpl').has('Badge')).toBe(true);
  });

  it('returns an empty set when there are no nmbl templates', () => {
    expect(collectNmblIdentifiers(ts, parse('const x = 1;')).size).toBe(0);
  });
});

describe('shouldFilterUnusedDiagnostic', () => {
  const sf = parse('import { Badge } from "./Badge";\nconst x = nmbl`\n  Badge\n`;');
  const idents = collectNmblIdentifiers(ts, sf);
  const badgeStart = sf.text.indexOf('Badge'); // the import specifier

  const mkDiag = (code: number, start: number, length: number): ts.Diagnostic => ({
    file: sf,
    start,
    length,
    code,
    category: ts.DiagnosticCategory.Suggestion,
    messageText: 'unused',
  });

  it('filters an unused-import diagnostic whose name is used in a template', () => {
    expect(shouldFilterUnusedDiagnostic(mkDiag(6133, badgeStart, 5), sf, idents)).toBe(true);
  });

  it('does NOT filter diagnostics with non-unused codes', () => {
    expect(shouldFilterUnusedDiagnostic(mkDiag(2304, badgeStart, 5), sf, idents)).toBe(false);
  });

  it('does NOT filter a name that is not referenced in any template', () => {
    const other = parse('import { Unused } from "./u";\nconst x = nmbl`\n  Badge\n`;');
    const oIdents = collectNmblIdentifiers(ts, other);
    const uStart = other.text.indexOf('Unused');
    const d = { ...mkDiag(6133, uStart, 6), file: other };
    expect(shouldFilterUnusedDiagnostic(d, other, oIdents)).toBe(false);
  });

  it('does NOT filter when the diagnostic belongs to a different file', () => {
    const d = { ...mkDiag(6133, badgeStart, 5), file: parse('x', '/other.tsx') };
    expect(shouldFilterUnusedDiagnostic(d, sf, idents)).toBe(false);
  });

  it('every UNUSED_CODES entry is a number', () => {
    for (const c of UNUSED_CODES) expect(typeof c).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Integration: run a REAL TypeScript language service over in-memory files and
// prove the plugin's filter removes the false positive while keeping a genuine
// unused import. This is the behaviour a user sees in the editor.
// ---------------------------------------------------------------------------
describe('integration: real LanguageService diagnostics', () => {
  const files: Record<string, string> = {
    '/tag.ts':
      'export function nmbl(_s: TemplateStringsArray, ..._e: unknown[]): any { return null; }',
    '/Badge.tsx': 'export function Badge(_p: { text: string }) { return null as any; }',
    '/Unused.ts': 'export const Unused = 1;',
    '/App.tsx': [
      'import { nmbl } from "./tag";',
      'import { Badge } from "./Badge";',
      'import { Unused } from "./Unused";',
      'export default function App() {',
      '  return nmbl`',
      '    div',
      '      Badge(text="hi")',
      '  `;',
      '}',
      '',
    ].join('\n'),
  };

  const options: ts.CompilerOptions = {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2020,
    strict: true,
    noEmit: true,
  };

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => Object.keys(files),
    getScriptVersion: () => '1',
    getScriptSnapshot: (fileName) => {
      if (fileName in files) return ts.ScriptSnapshot.fromString(files[fileName]);
      if (ts.sys.fileExists(fileName)) {
        return ts.ScriptSnapshot.fromString(ts.sys.readFile(fileName)!);
      }
      return undefined;
    },
    getCurrentDirectory: () => '/',
    getCompilationSettings: () => options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: (f) => f in files || ts.sys.fileExists(f),
    readFile: (f) => (f in files ? files[f] : ts.sys.readFile(f)),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };

  const ls = ts.createLanguageService(host, ts.createDocumentRegistry());

  // TS spans the whole import statement for an unused single import, so we test
  // by substring rather than exact name.
  const sliceOf = (d: ts.Diagnostic) => files['/App.tsx'].substr(d.start!, d.length!);
  const unusedSlices = (diags: readonly ts.Diagnostic[]) =>
    diags.filter((d) => UNUSED_CODES.has(d.code)).map(sliceOf);

  it('TS itself reports both Badge and Unused as unused (the bug we fix)', () => {
    const slices = unusedSlices(ls.getSuggestionDiagnostics('/App.tsx'));
    expect(slices.some((s) => s.includes('Badge'))).toBe(true);
    expect(slices.some((s) => s.includes('Unused'))).toBe(true);
  });

  it('after filtering, Badge is no longer flagged but Unused still is', () => {
    const sourceFile = ls.getProgram()!.getSourceFile('/App.tsx')!;
    const idents = collectNmblIdentifiers(ts, sourceFile);
    const filtered = filterUnusedDiagnostics(
      ls.getSuggestionDiagnostics('/App.tsx'),
      sourceFile,
      idents,
    );
    const slices = unusedSlices(filtered);
    expect(slices.some((s) => s.includes('Badge'))).toBe(false);
    expect(slices.some((s) => s.includes('Unused'))).toBe(true);
  });
});
