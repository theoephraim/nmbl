import { ViewPlugin, Decoration, EditorView } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

// Rainbow indent guides — nmbl's signature motif. Each level of leading
// indentation gets a thin coloured guide, cycling through the canonical
// --rainbow-* ramp so structure reads as colour. Purely decorative: the marks
// only paint a box-shadow, so they never shift the text or affect offsets.

// One indent level = this many columns of leading whitespace. nmbl (and the
// playground examples) use a 2-space step; a tab counts as one column.
const INDENT_UNIT = 2;
const RAMP = 6;

const marks = Array.from({ length: RAMP }, (_, i) =>
  Decoration.mark({ class: `cm-indent-rainbow cm-indent-rainbow-${i}` }),
);

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const text = line.text;
      let ws = 0;
      while (ws < text.length && (text[ws] === ' ' || text[ws] === '\t')) ws++;
      for (let col = 0; col + INDENT_UNIT <= ws; col += INDENT_UNIT) {
        const level = Math.floor(col / INDENT_UNIT) % RAMP;
        builder.add(line.from + col, line.from + col + INDENT_UNIT, marks[level]);
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export const indentRainbow = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
