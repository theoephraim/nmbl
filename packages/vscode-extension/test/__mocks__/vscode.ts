/**
 * Minimal vscode stub for unit tests.
 *
 * Only the classes/enums/functions actually used by embedded-forwarding.ts are
 * implemented — everything else is a no-op placeholder so TypeScript doesn't
 * complain and tests don't need a live VS Code host.
 */

export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number,
  ) {}
}

export class Range {
  constructor(
    public readonly start: Position,
    public readonly end: Position,
  ) {}
}

export class CompletionItem {
  kind?: CompletionItemKind;
  documentation?: string;
  detail?: string;
  insertText?: string;
  range?: Range;
  additionalTextEdits?: TextEdit[];
  filterText?: string;
  sortText?: string;
  command?: unknown;

  constructor(
    public label: string | { label: string; description?: string; detail?: string },
    kind?: CompletionItemKind,
  ) {
    this.kind = kind;
  }
}

export class CompletionList {
  constructor(
    public items: CompletionItem[],
    public isIncomplete: boolean = false,
  ) {}
}

export class TextEdit {
  constructor(
    public range: Range,
    public newText: string,
  ) {}
}

export class Hover {
  constructor(
    public contents: string[],
    public range?: Range,
  ) {}
}

export enum CompletionItemKind {
  Text = 0,
  Method = 1,
  Function = 2,
  Constructor = 3,
  Field = 4,
  Variable = 5,
  Class = 6,
  Interface = 7,
  Module = 8,
  Property = 9,
  Unit = 10,
  Value = 11,
  Enum = 12,
  Keyword = 13,
  Snippet = 14,
  Color = 15,
  Reference = 17,
  File = 16,
  Folder = 18,
  EnumMember = 19,
  Constant = 20,
  Struct = 21,
  Event = 22,
  Operator = 23,
  TypeParameter = 24,
}

export class DocumentDropOrPasteEditKind {
  static readonly Empty = new DocumentDropOrPasteEditKind('');
  static readonly Text = new DocumentDropOrPasteEditKind('text');
  static readonly TextUpdateImports = new DocumentDropOrPasteEditKind('text.updateImports');

  constructor(public readonly value: string) {}

  append(...parts: string[]): DocumentDropOrPasteEditKind {
    const joined = [this.value, ...parts].filter(Boolean).join('.');
    return new DocumentDropOrPasteEditKind(joined);
  }

  intersects(other: DocumentDropOrPasteEditKind): boolean {
    return this.value === other.value ||
      this.value.startsWith(other.value + '.') ||
      other.value.startsWith(this.value + '.');
  }

  contains(other: DocumentDropOrPasteEditKind): boolean {
    return this.value === other.value || other.value.startsWith(this.value + '.');
  }
}

export class DocumentPasteEdit {
  yieldTo?: DocumentDropOrPasteEditKind[];
  additionalEdit?: unknown;

  constructor(
    public insertText: string,
    public title: string,
    public kind: DocumentDropOrPasteEditKind,
  ) {}
}

export const languages = {
  registerCompletionItemProvider: () => ({ dispose: () => {} }),
  registerDefinitionProvider: () => ({ dispose: () => {} }),
  registerHoverProvider: () => ({ dispose: () => {} }),
  registerDocumentPasteEditProvider: () => ({ dispose: () => {} }),
};

export const commands = {
  executeCommand: async () => undefined,
  registerCommand: (_id: string, _handler: () => unknown) => ({ dispose: () => {} }),
};

export const workspace = {
  createFileSystemWatcher: () => ({ dispose: () => {} }),
};

export const window = {
  activeTextEditor: undefined as unknown,
  showErrorMessage: (_msg: string) => Promise.resolve(undefined),
  showInformationMessage: (_msg: string) => Promise.resolve(undefined),
};

// Re-export types needed by type-only usage
export type CompletionItemLabel = { label: string; description?: string; detail?: string };
export type Definition = unknown;
export type DocumentSelector = unknown;
export type ExtensionContext = { subscriptions: { push: (...items: unknown[]) => void } };
export type TextDocument = {
  getText: () => string;
  offsetAt: (pos: Position) => number;
  positionAt: (offset: number) => Position;
  getWordRangeAtPosition: (pos: Position, pattern?: RegExp) => Range | undefined;
  lineAt: (line: number | Position) => { text: string };
  uri: unknown;
  languageId: string;
};
export type DataTransfer = {
  get: (mimeType: string) => { value: string | null } | undefined;
};
export type DataTransferItem = { value: string };
export type DocumentPasteEditContext = {
  only: DocumentDropOrPasteEditKind | undefined;
  triggerKind: number;
};
export type CancellationToken = { isCancellationRequested: boolean };
export type DocumentPasteEditProvider = unknown;
export type DocumentPasteProviderMetadata = {
  providedPasteEditKinds: DocumentDropOrPasteEditKind[];
  pasteMimeTypes?: string[];
};
