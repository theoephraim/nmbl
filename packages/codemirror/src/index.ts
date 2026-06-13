/**
 * CodeMirror 6 language support for NMBL.
 *
 * The tokenizer is the GENERATED Monarch definition from @nmbl-lang/core —
 * the same single grammar source that produces the TextMate grammar (VS Code,
 * shiki) and the tree-sitter grammar. No hand-maintained rules here.
 */
import { StreamLanguage } from '@codemirror/language';
import monarchDef from '@nmbl-lang/core/monarch' with { type: 'json' };
import { MonarchTokenizer, type MonarchDefinition } from './monarch-runtime.js';

export { MonarchTokenizer, type MonarchDefinition } from './monarch-runtime.js';

const tokenizer = new MonarchTokenizer(monarchDef as MonarchDefinition);

/** Monarch token vocabulary → CodeMirror stream-parser style names. */
const TOKEN_STYLES: Record<string, string | null> = {
  'tag': 'tagName',
  'attribute.name': 'attributeName',
  'comment': 'comment',
  'string': 'string',
  'string.escape': 'string',
  'keyword': 'keyword',
  'delimiter': 'punctuation',
  'delimiter.bracket': 'punctuation',
  'delimiter.parenthesis': 'punctuation',
  'identifier': 'variableName',
  'variable': 'variableName',
  'white': null,
  '': null,
  'invalid': null,
};

interface NmblStreamState {
  stack: string[];
}

export const nmblLanguage = StreamLanguage.define<NmblStreamState>({
  name: 'nmbl',
  startState: () => ({ stack: tokenizer.initialStack() }),
  copyState: (s) => ({ stack: [...s.stack] }),
  token(stream, state) {
    // CodeMirror never calls token() at end of line, so Monarch's `$` rules
    // (end-of-line state resets) run when the NEXT line starts.
    if (stream.sol()) tokenizer.endOfLine(state.stack);
    const { token, end } = tokenizer.next(stream.string, stream.pos, state.stack);
    stream.pos = end;
    return TOKEN_STYLES[token] ?? null;
  },
});
