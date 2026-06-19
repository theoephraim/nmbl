/**
 * format.ts
 *
 * Wires the NMBL core formatter (@nmbl-lang/core) into VS Code:
 *
 *   - DocumentFormattingEditProvider for `.nmbl` files → enables "Format
 *     Document" and format-on-save for standalone NMBL. We register this ONLY
 *     for the `nmbl` language so we never compete with the Vue/Svelte/Astro
 *     host formatters for those files.
 *
 *   - `nmbl.formatDocument` command → formats every NMBL region in the active
 *     document (a whole `.nmbl` file, or the <template lang="nmbl"> blocks /
 *     nmbl`…` templates inside an SFC/JSX file) on demand, without claiming to
 *     own formatting for the host language.
 *
 * @nmbl-lang/core is ESM-only; this CJS module loads it via a cached dynamic
 * import, mirroring convert.ts.
 */

import * as vscode from 'vscode';

interface ParserModule {
  format: (
    source: string,
    options?: { indent?: number; printWidth?: number },
  ) => { code: string; errors: Array<{ message: string; span: { start: { line: number; column: number } } }>; formatted: boolean };
  formatFile: (
    source: string,
    filename: string,
    options?: { indent?: number; printWidth?: number },
  ) => {
    code: string;
    changed: boolean;
    errors: Array<{ message: string; span: { start: { line: number; column: number } } }>;
    skipped: Array<{ start: number; reason: string }>;
  };
}

let _parserPromise: Promise<ParserModule> | undefined;
function getParser(): Promise<ParserModule> {
  if (!_parserPromise) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _parserPromise = import('@nmbl-lang/core') as Promise<any>;
  }
  return _parserPromise;
}

/** A TextEdit replacing the whole document with `newText`. */
export function fullDocumentEdit(document: vscode.TextDocument, newText: string): vscode.TextEdit[] {
  if (newText === document.getText()) return [];
  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length),
  );
  return [vscode.TextEdit.replace(fullRange, newText)];
}

/**
 * Best-effort filename for the core formatter's extension detection. Falls back
 * to the language id when the document is untitled / extensionless.
 */
export function filenameFor(document: vscode.TextDocument): string {
  const fsPath = document.uri.fsPath;
  if (/\.(nmbl|vue|svelte|astro|jsx|tsx|js|ts|mjs|cjs)$/i.test(fsPath)) return fsPath;
  const extByLang: Record<string, string> = {
    nmbl: 'nmbl', vue: 'vue', svelte: 'svelte', astro: 'astro',
    typescriptreact: 'tsx', javascriptreact: 'jsx', typescript: 'ts', javascript: 'js',
  };
  const ext = extByLang[document.languageId] ?? 'nmbl';
  return `untitled.${ext}`;
}

function indentFromOptions(options: vscode.FormattingOptions): number | undefined {
  return options.insertSpaces ? options.tabSize : undefined;
}

/** Document formatter for standalone `.nmbl` files. */
const nmblFormattingProvider: vscode.DocumentFormattingEditProvider = {
  async provideDocumentFormattingEdits(document, options) {
    const { format } = await getParser();
    const result = format(document.getText(), { indent: indentFromOptions(options) });
    if (!result.formatted) {
      const first = result.errors[0];
      if (first) {
        vscode.window.setStatusBarMessage(
          `NMBL: not formatted — ${first.message} (line ${first.span.start.line + 1})`,
          5000,
        );
      }
      return [];
    }
    return fullDocumentEdit(document, result.code);
  },
};

/** Command: format NMBL anywhere it appears in the active document. */
async function formatDocumentCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const document = editor.document;
  const { formatFile } = await getParser();
  const indent = editor.options.insertSpaces ? Number(editor.options.tabSize) : undefined;

  const result = formatFile(document.getText(), filenameFor(document), { indent });

  if (result.errors.length) {
    const first = result.errors[0];
    vscode.window.showErrorMessage(
      `NMBL: could not format — ${first.message} (line ${first.span.start.line + 1})`,
    );
    return;
  }
  if (!result.changed) {
    vscode.window.setStatusBarMessage('NMBL: already formatted', 2000);
    return;
  }
  const edits = fullDocumentEdit(document, result.code);
  if (edits.length === 0) return;
  const wsEdit = new vscode.WorkspaceEdit();
  wsEdit.set(document.uri, edits);
  await vscode.workspace.applyEdit(wsEdit);
}

export function registerFormatting(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      { language: 'nmbl', scheme: 'file' },
      nmblFormattingProvider,
    ),
    vscode.languages.registerDocumentFormattingEditProvider(
      { language: 'nmbl', scheme: 'untitled' },
      nmblFormattingProvider,
    ),
    vscode.commands.registerCommand('nmbl.formatDocument', formatDocumentCommand),
  );
}
