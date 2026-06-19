import { describe, test, expect } from 'vitest';
// vitest.config.ts aliases `vscode` → test/__mocks__/vscode.ts.
import { filenameFor, fullDocumentEdit } from '../client/format';

function fakeDoc(fsPath: string, languageId: string, text = ''): any {
  return {
    uri: { fsPath },
    languageId,
    getText: () => text,
    positionAt: (offset: number) => ({ offset }),
  };
}

describe('filenameFor', () => {
  test('uses the real path when it has a supported extension', () => {
    expect(filenameFor(fakeDoc('/a/b/c.nmbl', 'nmbl'))).toBe('/a/b/c.nmbl');
    expect(filenameFor(fakeDoc('/x/App.vue', 'vue'))).toBe('/x/App.vue');
  });

  test('falls back to a language-derived extension when path has none', () => {
    expect(filenameFor(fakeDoc('Untitled-1', 'nmbl'))).toBe('untitled.nmbl');
    expect(filenameFor(fakeDoc('Untitled-2', 'typescriptreact'))).toBe('untitled.tsx');
    expect(filenameFor(fakeDoc('Untitled-3', 'svelte'))).toBe('untitled.svelte');
  });

  test('defaults to nmbl for unknown language ids', () => {
    expect(filenameFor(fakeDoc('weird', 'plaintext'))).toBe('untitled.nmbl');
  });
});

describe('fullDocumentEdit', () => {
  test('returns no edits when the text is unchanged', () => {
    const doc = fakeDoc('/a.nmbl', 'nmbl', 'div\n  p hi\n');
    expect(fullDocumentEdit(doc, 'div\n  p hi\n')).toEqual([]);
  });

  test('returns a single replace edit when changed', () => {
    const doc = fakeDoc('/a.nmbl', 'nmbl', 'div');
    const edits = fullDocumentEdit(doc, 'div\n  p hi\n');
    expect(edits).toHaveLength(1);
    expect(edits[0].newText).toBe('div\n  p hi\n');
  });
});
