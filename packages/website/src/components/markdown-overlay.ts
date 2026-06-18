/**
 * Markdown highlighting for `:md` content blocks in the NMBL editor.
 *
 * The playground's NMBL tokenizer is the generated Monarch grammar, which only
 * knows structural tokens (tag/attribute/comment/…) — it treats a `:md` body as
 * plain text. This overlay finds those bodies and decorates the markdown inside
 * them (headings, bold, inline code, links, list markers) so the playground
 * matches what the `:md` feature actually does. Regex-level, not a full parser —
 * enough to read as markdown without pulling in a second language.
 */
import { StateField, type Extension, type Range } from '@codemirror/state';
import type { EditorState } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

const headingMark = Decoration.mark({ class: 'cm-md-heading' });
const strongMark = Decoration.mark({ class: 'cm-md-strong' });
const emMark = Decoration.mark({ class: 'cm-md-em' });
const codeMark = Decoration.mark({ class: 'cm-md-code' });
const linkMark = Decoration.mark({ class: 'cm-md-link' });
const listMark = Decoration.mark({ class: 'cm-md-list' });

// Emphasis is matched bold-first (`**…**` before `*…*` / `_…_`) so the double
// asterisks of bold are consumed as a unit and never read as italic.
const EMPHASIS = /(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(_[^_\n]+_)/g;
const CODE = /`[^`\n]+`/g;
const LINK = /\[[^\]\n]+\]\([^)\n]+\)/g;

function buildDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const doc = state.doc;
  let inMd = false;
  let mdIndent = 0;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;
    const blank = text.trim() === '';
    const indent = text.length - text.replace(/^\s+/, '').length;

    // A content block ends at the first non-blank line indented no deeper than
    // its `…:md` introducer.
    if (inMd && !blank && indent <= mdIndent) inMd = false;

    if (!inMd) {
      if (/:md\s*$/.test(text)) { inMd = true; mdIndent = indent; }
      continue;
    }
    if (blank) continue;

    const heading = /^(\s*)(#{1,6}\s.*)$/.exec(text);
    if (heading) ranges.push(headingMark.range(line.from + heading[1].length, line.to));

    const list = /^(\s*)([-*+]\s)/.exec(text);
    if (list) {
      const start = line.from + list[1].length;
      ranges.push(listMark.range(start, start + list[2].length));
    }

    let m: RegExpExecArray | null;
    EMPHASIS.lastIndex = 0;
    while ((m = EMPHASIS.exec(text))) {
      ranges.push((m[1] ? strongMark : emMark).range(line.from + m.index, line.from + m.index + m[0].length));
    }
    CODE.lastIndex = 0;
    while ((m = CODE.exec(text))) ranges.push(codeMark.range(line.from + m.index, line.from + m.index + m[0].length));
    LINK.lastIndex = 0;
    while ((m = LINK.exec(text))) ranges.push(linkMark.range(line.from + m.index, line.from + m.index + m[0].length));
  }

  return Decoration.set(ranges, true);
}

/** Highlight markdown inside `:md` content blocks. Add to the NMBL editor only. */
export const markdownOverlay: Extension = StateField.define<DecorationSet>({
  create: buildDecorations,
  update: (deco, tr) => (tr.docChanged ? buildDecorations(tr.state) : deco),
  provide: (f) => EditorView.decorations.from(f),
});
