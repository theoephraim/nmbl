"use strict";
/**
 * format.ts
 *
 * Wires the NMBL core formatter (@nmbl/parser) into VS Code:
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
 * @nmbl/parser is ESM-only; this CJS module loads it via a cached dynamic
 * import, mirroring convert.ts.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.fullDocumentEdit = fullDocumentEdit;
exports.filenameFor = filenameFor;
exports.registerFormatting = registerFormatting;
const vscode = __importStar(require("vscode"));
let _parserPromise;
function getParser() {
    if (!_parserPromise) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _parserPromise = import('@nmbl/parser');
    }
    return _parserPromise;
}
/** A TextEdit replacing the whole document with `newText`. */
function fullDocumentEdit(document, newText) {
    if (newText === document.getText())
        return [];
    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
    return [vscode.TextEdit.replace(fullRange, newText)];
}
/**
 * Best-effort filename for the core formatter's extension detection. Falls back
 * to the language id when the document is untitled / extensionless.
 */
function filenameFor(document) {
    const fsPath = document.uri.fsPath;
    if (/\.(nmbl|vue|svelte|astro|jsx|tsx|js|ts|mjs|cjs)$/i.test(fsPath))
        return fsPath;
    const extByLang = {
        nmbl: 'nmbl', vue: 'vue', svelte: 'svelte', astro: 'astro',
        typescriptreact: 'tsx', javascriptreact: 'jsx', typescript: 'ts', javascript: 'js',
    };
    const ext = extByLang[document.languageId] ?? 'nmbl';
    return `untitled.${ext}`;
}
function indentFromOptions(options) {
    return options.insertSpaces ? options.tabSize : undefined;
}
/** Document formatter for standalone `.nmbl` files. */
const nmblFormattingProvider = {
    async provideDocumentFormattingEdits(document, options) {
        const { format } = await getParser();
        const result = format(document.getText(), { indent: indentFromOptions(options) });
        if (!result.formatted) {
            const first = result.errors[0];
            if (first) {
                vscode.window.setStatusBarMessage(`NMBL: not formatted — ${first.message} (line ${first.span.start.line + 1})`, 5000);
            }
            return [];
        }
        return fullDocumentEdit(document, result.code);
    },
};
/** Command: format NMBL anywhere it appears in the active document. */
async function formatDocumentCommand() {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    const document = editor.document;
    const { formatFile } = await getParser();
    const indent = editor.options.insertSpaces ? Number(editor.options.tabSize) : undefined;
    const result = formatFile(document.getText(), filenameFor(document), { indent });
    if (result.errors.length) {
        const first = result.errors[0];
        vscode.window.showErrorMessage(`NMBL: could not format — ${first.message} (line ${first.span.start.line + 1})`);
        return;
    }
    if (!result.changed) {
        vscode.window.setStatusBarMessage('NMBL: already formatted', 2000);
        return;
    }
    const edits = fullDocumentEdit(document, result.code);
    if (edits.length === 0)
        return;
    const wsEdit = new vscode.WorkspaceEdit();
    wsEdit.set(document.uri, edits);
    await vscode.workspace.applyEdit(wsEdit);
}
function registerFormatting(context) {
    context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider({ language: 'nmbl', scheme: 'file' }, nmblFormattingProvider), vscode.languages.registerDocumentFormattingEditProvider({ language: 'nmbl', scheme: 'untitled' }, nmblFormattingProvider), vscode.commands.registerCommand('nmbl.formatDocument', formatDocumentCommand));
}
