/**
 * convert.ts
 *
 * Feature 1: Paste HTML as NMBL — registers a DocumentPasteEditProvider so
 *   that when the user pastes text that looks like HTML into a .nmbl file
 *   (or into a <template lang="nmbl"> region of a .vue/.svelte/.astro file),
 *   VS Code offers to convert it to NMBL via the paste widget.
 *
 * Feature 2: Explicit conversion commands — registered on the extension
 *   context and exposed in the editor context menu:
 *     nmbl.convertHtmlToNmbl  — selection → decompile → replace
 *     nmbl.convertNmblToHtml  — selection → compile  → replace
 *
 * Pure helpers (looksLikeHtml, reindent, dedentSelection, chooseFramework)
 * are exported so they can be unit-tested without a VS Code host.
 */

import * as vscode from 'vscode';
import { nmblRegionAt } from './embedded-forwarding';

// @nmbl-lang/core is ESM-only; use a dynamic import so this CJS module can load it.
// The loaded functions are cached after the first call.
interface ParserModule {
  compile: (source: string, options?: { framework?: string; filename?: string }) => {
    html: string;
    errors: Array<{ message: string; span?: { start: { line: number; column: number } } }>;
  };
  decompile: (html: string, options?: { indent?: number }) => string;
}
let _parserPromise: Promise<ParserModule> | undefined;
function getParser(): Promise<ParserModule> {
  if (!_parserPromise) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _parserPromise = import('@nmbl-lang/core') as Promise<any>;
  }
  return _parserPromise;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Returns true when `text` looks like HTML.
 *
 * Conservative heuristic:
 *   - Trimmed text must start with '<' followed by a letter, '!', or '/'.
 *   - AND the text must either contain '</' or '/>' (element with closing tag or
 *     self-closing), OR be a single void/self-contained tag (no inner content
 *     after the tag that could imply it is just a comparison).
 *
 * This deliberately rejects plain text, NMBL, JS code (a < b), etc.
 */
export function looksLikeHtml(text: string): boolean {
  const trimmed = text.trim();
  // Must start with '<' followed by a letter, '!', or '/'
  if (!/^<[a-zA-Z!/]/.test(trimmed)) return false;
  // Must have a closing tag indicator or self-closing tag
  if (/<\//.test(trimmed)) return true;
  if (/\/>/.test(trimmed)) return true;
  // Single void element like <br> or <img ...> with no content after
  // Allow a tag that ends with '>' and has no text following outside a tag
  if (/^<[a-zA-Z][^>]*>$/.test(trimmed)) return true;
  return false;
}

/**
 * True when the text is an SVG document/fragment (root element is `<svg>`).
 *
 * SVG passes `looksLikeHtml`, but converting it to NMBL is almost never wanted —
 * it's verbose markup with namespaces, `viewBox`, path data, etc. that a user
 * pasting an icon wants verbatim. The paste-to-NMBL provider skips these so a
 * plain Ctrl+V keeps the SVG as-is. (The explicit convert command still works.)
 */
export function isSvg(text: string): boolean {
  return /^<svg[\s>]/i.test(text.trim());
}

/**
 * Re-indent NMBL output for insertion at a cursor position.
 *
 * The first line of `nmbl` is inserted at the cursor column so it should NOT
 * be double-prefixed — it already lands at the right indentation context.
 * Lines 2+ each get `indentPrefix` prepended.
 *
 * Trailing newline is trimmed so callers control the final newline.
 */
export function reindent(nmbl: string, indentPrefix: string): string {
  // Strip trailing newline the decompiler always adds
  const lines = nmbl.replace(/\n$/, '').split('\n');
  return lines
    .map((line, i) => (i === 0 ? line : indentPrefix + line))
    .join('\n');
}

/**
 * Strip the common leading indentation from a multi-line string.
 *
 * Blank lines are ignored when computing the common prefix but are preserved
 * (with leading whitespace stripped) in the output.
 */
export function dedentSelection(text: string): string {
  const lines = text.split('\n');
  // Compute minimum indent from non-blank lines
  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim() === '') continue;
    const match = /^(\s*)/.exec(line);
    const indent = match ? match[1].length : 0;
    if (indent < minIndent) minIndent = indent;
  }
  if (!isFinite(minIndent) || minIndent === 0) return text;
  return lines.map((line) => line.substring(minIndent)).join('\n');
}

/**
 * Choose the NMBL compiler framework based on the document's language ID.
 */
export function chooseFramework(
  languageId: string,
): 'vue' | 'svelte' | 'astro' | 'html' {
  if (languageId === 'vue') return 'vue';
  if (languageId === 'svelte') return 'svelte';
  if (languageId === 'astro') return 'astro';
  return 'html';
}

// ---------------------------------------------------------------------------
// Feature 1 — Paste HTML as NMBL
// ---------------------------------------------------------------------------

/** The NMBL paste edit kind: text.nmbl */
const NMBL_PASTE_KIND = vscode.DocumentDropOrPasteEditKind.Text.append('nmbl');

/**
 * DocumentPasteEditProvider that converts pasted HTML to NMBL.
 *
 * The conversion is the DEFAULT paste action when the clipboard looks like
 * HTML and the cursor is in NMBL territory (the `looksLikeHtml` gate keeps
 * this conservative). Plain-text paste stays one click away in the paste
 * widget (Ctrl+Shift+V / the paste drop-down).
 */
const pasteProvider: vscode.DocumentPasteEditProvider = {
  async provideDocumentPasteEdits(
    document: vscode.TextDocument,
    ranges: readonly vscode.Range[],
    dataTransfer: vscode.DataTransfer,
    _context: vscode.DocumentPasteEditContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.DocumentPasteEdit[] | undefined> {
    // Get pasted text
    const textItem = dataTransfer.get('text/plain');
    if (!textItem) return undefined;

    // DataTransferItem.value may be a string or a DataTransferFile
    const pastedText: string =
      typeof textItem.value === 'string' ? textItem.value : '';
    if (!pastedText || !looksLikeHtml(pastedText)) return undefined;
    // Leave SVG pastes alone — converting an icon/graphic to NMBL is never the
    // intent, and this provider is the default paste action.
    if (isSvg(pastedText)) return undefined;

    // For .nmbl files — always in scope; for embedded files — must be in region
    const languageId = document.languageId;
    if (languageId !== 'nmbl') {
      // Must be inside a <template lang="nmbl"> region
      const pastePosition = ranges[0]?.start;
      if (!pastePosition) return undefined;
      if (!nmblRegionAt(document, pastePosition)) return undefined;
    }

    // Decompile HTML → NMBL (lazy-load the ESM parser)
    const { decompile } = await getParser();
    let nmbl: string;
    try {
      nmbl = decompile(pastedText);
      if (!nmbl.trim()) return undefined;
    } catch {
      return undefined;
    }

    // Re-indent: get the indentation of the line where we are pasting
    const pastePosition = ranges[0]?.start ?? new vscode.Position(0, 0);
    const lineText = document.lineAt(pastePosition.line).text;
    const indentMatch = /^(\s*)/.exec(lineText);
    const indentPrefix = indentMatch ? indentMatch[1] : '';

    const insertText = reindent(nmbl, indentPrefix);

    const edit = new vscode.DocumentPasteEdit(
      insertText,
      'Paste HTML as NMBL',
      NMBL_PASTE_KIND,
    );
    // No yieldTo: this edit takes precedence over plain-text paste, so a
    // regular Ctrl+V converts automatically; plain paste remains available
    // via the paste widget.

    return [edit];
  },
};

// ---------------------------------------------------------------------------
// Feature 2 — Conversion commands
// ---------------------------------------------------------------------------

/**
 * nmbl.convertHtmlToNmbl
 * Selection → decompile(HTML) → re-indent → replace selection.
 */
async function convertHtmlToNmbl(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    vscode.window.showErrorMessage('NMBL: No selection to convert.');
    return;
  }
  const selectedText = editor.document.getText(editor.selection);
  const { decompile } = await getParser();
  let nmbl: string;
  try {
    nmbl = decompile(selectedText);
    if (!nmbl.trim()) {
      vscode.window.showErrorMessage('NMBL: decompile produced empty output.');
      return;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`NMBL: Failed to convert HTML: ${msg}`);
    return;
  }

  // Re-indent to the first line's indentation
  const firstLine = editor.document.lineAt(editor.selection.start.line).text;
  const indentMatch = /^(\s*)/.exec(firstLine);
  const indentPrefix = indentMatch ? indentMatch[1] : '';
  const result = reindent(nmbl, indentPrefix);

  await editor.edit((editBuilder) => {
    editBuilder.replace(editor.selection, result);
  });
}

/**
 * nmbl.convertNmblToHtml
 * Selection → dedent → compile(NMBL, framework) → re-indent → replace selection.
 * On error: show first error message and do NOT replace.
 */
async function convertNmblToHtml(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    vscode.window.showErrorMessage('NMBL: No selection to convert.');
    return;
  }

  const doc = editor.document;
  const selectedText = doc.getText(editor.selection);
  const dedented = dedentSelection(selectedText);
  const framework = chooseFramework(doc.languageId);
  const { compile } = await getParser();

  let html: string;
  try {
    const result = compile(dedented, { framework });
    if (result.errors && result.errors.length > 0) {
      const first = result.errors[0];
      // NmblError has span.start with line/column fields
      const loc =
        first.span
          ? ` (line ${first.span.start.line}, col ${first.span.start.column})`
          : '';
      vscode.window.showErrorMessage(
        `NMBL: Compile error: ${first.message}${loc}`,
      );
      return;
    }
    html = result.html;
    if (!html.trim()) {
      vscode.window.showErrorMessage('NMBL: compile produced empty output.');
      return;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`NMBL: Failed to compile NMBL: ${msg}`);
    return;
  }

  // Re-indent to the first selected line's indentation
  const firstLine = doc.lineAt(editor.selection.start.line).text;
  const indentMatch = /^(\s*)/.exec(firstLine);
  const indentPrefix = indentMatch ? indentMatch[1] : '';
  // html typically has no leading indent — reindent lines 2+
  const result2 = reindent(html.trimEnd(), indentPrefix);

  await editor.edit((editBuilder) => {
    editBuilder.replace(editor.selection, result2);
  });
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register all conversion features (paste provider + commands) on the context.
 * Call from activate() in extension.ts.
 */
export function registerConversions(context: vscode.ExtensionContext): void {
  // ── Paste HTML as NMBL ────────────────────────────────────────────────────
  const pasteSelector: vscode.DocumentSelector = [
    { language: 'nmbl', scheme: 'file' },
    { language: 'vue', scheme: 'file' },
    { language: 'svelte', scheme: 'file' },
    { language: 'astro', scheme: 'file' },
  ];

  const pasteDisposable = vscode.languages.registerDocumentPasteEditProvider(
    pasteSelector,
    pasteProvider,
    {
      providedPasteEditKinds: [NMBL_PASTE_KIND],
      pasteMimeTypes: ['text/plain'],
    },
  );

  // ── Commands ──────────────────────────────────────────────────────────────
  const htmlToNmblDisposable = vscode.commands.registerCommand(
    'nmbl.convertHtmlToNmbl',
    convertHtmlToNmbl,
  );
  const nmblToHtmlDisposable = vscode.commands.registerCommand(
    'nmbl.convertNmblToHtml',
    convertNmblToHtml,
  );

  context.subscriptions.push(
    pasteDisposable,
    htmlToNmblDisposable,
    nmblToHtmlDisposable,
  );
}
