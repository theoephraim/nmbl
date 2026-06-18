import { parseDocument } from 'htmlparser2';
import { VOID_ELEMENTS, INLINE_ELEMENTS } from './constants.js';

// Inline types to avoid direct dependency on domhandler
interface HNode { type: string; data?: string; }
interface HElement extends HNode { tagName: string; attribs: Record<string, string>; children: HNode[]; }

export interface DecompileOptions {
  /** Indentation size for output NMBL (default: 2) */
  indent?: number;
}

/**
 * Decompile HTML into NMBL syntax.
 */
export function decompile(html: string, options: DecompileOptions = {}): string {
  const indentSize = options.indent ?? 2;
  const doc = parseDocument(html, { decodeEntities: false });
  const lines = decompileChildren(doc.children as HNode[], 0, indentSize);
  return lines.join('\n') + '\n';
}

function decompileChildren(nodes: HNode[], depth: number, indentSize: number): string[] {
  const lines: string[] = [];

  for (const node of nodes) {
    // A whitespace-only gap containing a blank line separates siblings in the
    // source HTML — keep one blank line so the NMBL mirrors that rhythm
    // (matching the compiler, which preserves blank lines the other way).
    if (node.type === 'text' && !(node.data ?? '').trim()) {
      const newlines = ((node.data ?? '').match(/\n/g) ?? []).length;
      if (newlines >= 2 && lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
      continue;
    }
    const result = decompileNode(node, depth, indentSize);
    if (result !== null) {
      lines.push(...result);
    }
  }
  // a gap before a closing tag is noise, not separation
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function decompileNode(node: HNode, depth: number, indentSize: number): string[] | null {
  const indent = ' '.repeat(depth * indentSize);

  if (node.type === 'comment') {
    return [`${indent}//! ${(node.data ?? '').trim()}`];
  }

  if (node.type === 'text') {
    const value = node.data ?? '';
    if (!value.trim()) return null;
    const trimmed = value.trim();
    const textLines = trimmed.split('\n').filter((l: string) => l.trim());
    const out = textLines.map((l: string) => `${indent}| ${l.trim()}`);
    // Preserve significant trailing spaces with the trailing-`\` escape, so a
    // round trip keeps them (count included). "Significant" = real spaces the
    // author placed before any formatting newline (`text  ` or `text  \n  `),
    // not pure indentation (`text\n  `, whose trailing run starts with newline).
    const trail = (value.match(/\s*$/) ?? [''])[0];
    const sig = trail.split('\n')[0]; // spaces before any formatting newline
    if (/[ \t]/.test(sig) && out.length > 0) {
      out[out.length - 1] += sig + '\\';
    }
    return out;
  }

  if (node.type === 'tag' || node.type === 'script' || node.type === 'style') {
    return decompileElement(node as HElement, depth, indentSize);
  }

  return null;
}

function decompileElement(el: HElement, depth: number, indentSize: number): string[] {
  const indent = ' '.repeat(depth * indentSize);
  const tag = el.tagName.toLowerCase();
  const isVoid = VOID_ELEMENTS.has(tag);

  // Build the selector: tag + #id + .classes
  let selector = '';
  const attrs = { ...el.attribs };

  const id = attrs.id;
  if (id) delete attrs.id;

  const classStr = attrs.class;
  const classes = classStr ? classStr.split(/\s+/).filter(Boolean) : [];
  if (classStr !== undefined) delete attrs.class;

  // Use implicit div when div has id or classes
  const isImplicitDiv = tag === 'div' && (id || classes.length > 0);
  if (!isImplicitDiv) {
    selector = tag;
  }

  if (id) selector += `#${id}`;
  for (const cls of classes) {
    selector += `.${cls}`;
  }

  if (!selector) selector = tag;

  // Build attributes
  const attrParts: string[] = [];
  for (const [name, value] of Object.entries(attrs)) {
    if (value === '' || value === name) {
      attrParts.push(name);
    } else {
      attrParts.push(`${name}="${value}"`);
    }
  }
  const attrStr = attrParts.length > 0 ? `(${attrParts.join(' ')})` : '';

  if (isVoid) {
    return [`${indent}${selector}${attrStr}`];
  }

  const rawChildren = el.children as HNode[];
  const wasInline = !hasNewlineWhitespace(rawChildren);
  const significant = stripWhitespaceOnlyTextNodes(rawChildren);

  // No children
  if (significant.length === 0) {
    return [`${indent}${selector}${attrStr}`];
  }

  // Single text child — inline it
  if (significant.length === 1 && significant[0].type === 'text') {
    const text = (significant[0].data ?? '').trim();
    if (text && !text.includes('\n')) {
      return [`${indent}${selector}${attrStr} ${text}`];
    }
  }

  // Block expansion: single element child, only when the original HTML was inline
  if (wasInline && significant.length === 1 && isElementNode(significant[0])) {
    const childEl = significant[0] as HElement;
    const childLines = decompileElement(childEl, 0, indentSize);
    if (childLines.length === 1) {
      return [`${indent}${selector}${attrStr} > ${childLines[0].trim()}`];
    }
  }

  // Mixed inline content: text + inline elements, only when original was inline
  if (wasInline && isMixedInlineContent(significant)) {
    const inlineHtml = renderChildrenAsInlineHtml(significant);
    return [`${indent}${selector}${attrStr} ${inlineHtml}`];
  }

  // Multiple children — nest them
  const lines: string[] = [`${indent}${selector}${attrStr}`];
  for (const child of significant) {
    const childLines = decompileNode(child, depth + 1, indentSize);
    if (childLines) lines.push(...childLines);
  }
  return lines;
}

function isElementNode(node: HNode): boolean {
  return node.type === 'tag' || node.type === 'script' || node.type === 'style';
}

/**
 * Check if children contain whitespace-only text nodes with newlines.
 * This indicates the original HTML was formatted with line breaks (block layout).
 */
function hasNewlineWhitespace(nodes: HNode[]): boolean {
  return nodes.some(n =>
    n.type === 'text' && !(n.data ?? '').trim() && (n.data ?? '').includes('\n')
  );
}

/**
 * Check if all children are text nodes or inline elements (mixed inline content).
 * e.g. "Click <a href="/">here</a> to continue"
 */
function isMixedInlineContent(nodes: HNode[]): boolean {
  if (nodes.length <= 1) return false;

  let hasText = false;
  let hasInlineElement = false;

  for (const node of nodes) {
    if (node.type === 'text') {
      hasText = true;
    } else if (node.type === 'tag') {
      const el = node as HElement;
      if (INLINE_ELEMENTS.has(el.tagName.toLowerCase())) {
        hasInlineElement = true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  return hasText && hasInlineElement;
}

/**
 * Render children back as inline HTML string (for mixed inline content passthrough).
 */
function renderChildrenAsInlineHtml(nodes: HNode[]): string {
  let result = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      result += node.data ?? '';
    } else if (node.type === 'tag') {
      const el = node as HElement;
      const tag = el.tagName.toLowerCase();
      const attrs = Object.entries(el.attribs)
        .map(([k, v]) => v === '' ? k : `${k}="${v}"`)
        .join(' ');
      const attrStr = attrs ? ` ${attrs}` : '';

      if (VOID_ELEMENTS.has(tag)) {
        result += `<${tag}${attrStr}>`;
      } else {
        const innerContent = renderChildrenAsInlineHtml(el.children as HNode[]);
        result += `<${tag}${attrStr}>${innerContent}</${tag}>`;
      }
    }
  }
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Remove whitespace-only text nodes from a node list.
 */
function stripWhitespaceOnlyTextNodes(nodes: HNode[]): HNode[] {
  return nodes.filter(n => {
    if (n.type === 'text') return !!(n.data ?? '').trim();
    return true;
  });
}
