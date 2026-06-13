import { parseDocument } from 'htmlparser2';
import { INLINE_ELEMENTS, VOID_ELEMENTS } from './constants.js';

// Inline shapes (avoid a direct domhandler dependency)
interface HNode { type: string; data?: string; }
interface HElement extends HNode { name: string; attribs: Record<string, string>; children: HNode[]; }

// Whitespace inside these is significant — serialize their bodies verbatim.
const PRESERVE = new Set(['pre', 'textarea', 'script', 'style']);

export interface HtmlFormatOptions {
  /** Indent prepended to every emitted line (the host element's child depth). */
  baseIndent: string;
  /** One indentation step. */
  unit: string;
  /** Self-close void elements (`<br />`) for JSX-ish targets. */
  xhtml?: boolean;
}

/**
 * Pretty-print a fragment of generated HTML (e.g. a `:md` filter's output) so it
 * nests inside the surrounding template instead of sitting flat at column 0.
 *
 * Block elements get their own lines and indent their children one level deeper;
 * an element whose children are all inline/text stays on one line (with any
 * internal soft-wraps aligned under it). Preformatted elements (<pre>, <script>,
 * …) are emitted verbatim. Entities are preserved (the compiler escapes `{`/`}`
 * as `&#123;`/`&#125;` upstream, and those must survive).
 */
export function formatHtml(html: string, opts: HtmlFormatOptions): string {
  const { baseIndent, unit, xhtml = false } = opts;
  const doc = parseDocument(html, { decodeEntities: false }) as unknown as { children: HNode[] };
  const lines: string[] = [];

  const isEl = (n: HNode): n is HElement => n.type === 'tag' || n.type === 'script' || n.type === 'style';
  const isInline = (n: HNode): boolean =>
    n.type === 'text' || n.type === 'comment' || (isEl(n) && INLINE_ELEMENTS.has(n.name));

  const openTag = (el: HElement): string => {
    const attrs = Object.entries(el.attribs)
      .map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${v}"`))
      .join('');
    return `<${el.name}${attrs}>`;
  };

  // Serialize a subtree to a single inline string (no structural newlines added;
  // any newlines present are the content's own).
  const inlineStr = (n: HNode): string => {
    if (n.type === 'text') return (n as HNode).data ?? '';
    if (n.type === 'comment') return `<!--${(n as HNode).data ?? ''}-->`;
    if (!isEl(n)) return '';
    if (VOID_ELEMENTS.has(n.name)) {
      const t = openTag(n);
      return xhtml ? t.replace(/>$/, ' />') : t;
    }
    return `${openTag(n)}${n.children.map(inlineStr).join('')}</${n.name}>`;
  };

  const meaningful = (kids: HNode[]): HNode[] =>
    kids.filter(k => !(k.type === 'text' && !((k as HNode).data ?? '').trim()));

  const renderBlock = (n: HNode, depth: number): void => {
    const ind = baseIndent + unit.repeat(depth);
    if (n.type === 'text') {
      const t = ((n as HNode).data ?? '').trim();
      if (t) lines.push(ind + t);
      return;
    }
    if (n.type === 'comment') {
      lines.push(`${ind}<!--${(n as HNode).data ?? ''}-->`);
      return;
    }
    if (!isEl(n)) return;
    if (VOID_ELEMENTS.has(n.name)) {
      lines.push(ind + inlineStr(n));
      return;
    }
    if (PRESERVE.has(n.name)) {
      // verbatim body — only the opening line is indented; inner whitespace is kept
      lines.push(`${ind}${openTag(n)}${n.children.map(inlineStr).join('')}</${n.name}>`);
      return;
    }
    const kids = meaningful(n.children);
    if (kids.length === 0) {
      lines.push(`${ind}${openTag(n)}</${n.name}>`);
      return;
    }
    if (kids.every(isInline)) {
      // all-inline content stays with the tag; align any soft-wrapped lines
      const inner = kids.map(inlineStr).join('');
      const parts = inner.split('\n');
      const body = parts.length === 1
        ? inner
        : parts.map((l, i) => (i === 0 ? l : ind + unit + l.trim())).join('\n');
      lines.push(`${ind}${openTag(n)}${body}</${n.name}>`);
      return;
    }
    // block-level children: open, recurse deeper, close
    lines.push(ind + openTag(n));
    for (const k of kids) renderBlock(k, depth + 1);
    lines.push(`${ind}</${n.name}>`);
  };

  for (const top of doc.children) renderBlock(top, 0);
  return lines.join('\n');
}
