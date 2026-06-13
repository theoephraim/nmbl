import type {
  DocumentNode, ElementNode, AttributeNode, TextNode,
  HtmlCommentNode, ContentBlockNode, AstNode,
  BlockNode, InlineDirectiveNode,
} from './ast.js';
import type { SourceSpan, SourcePosition } from './source-location.js';
import { span } from './source-location.js';
import { ErrorCode, createError, type NmblError } from './errors.js';
import { formatHtml } from './html-format.js';

export interface CompilerOptions {
  indent?: number;
  xhtml?: boolean;
  /**
   * The host framework — decides what `@if`-style blocks compile to:
   * - 'svelte': native Svelte blocks ({#if}/{:else}/{#each}/{#await}/…)
   * - 'vue':    renderless <template v-if>/<template v-for> wrappers (only
   *             @if/@elseif/@else/@each)
   * - 'astro':  JSX expressions ({cond && (…)}, {items.map(…)}); only @if/@each
   * - 'jsx':    like 'astro' but for JSX-the-language (React/Solid/Qwik/Preact
   *             via the tagged-template transform): self-closing voids,
   *             brace-comment output for rendered comments, @each :key → a
   *             JSX key attribute on the iteration root, attribute aliasing
   *             (class→className)
   * - 'html':   @-blocks are a compile ERROR
   * @each accepts BOTH `item of items` and `items as item (key)` forms and
   * compiles each host's native syntax from the parsed structure.
   * Defaults to 'html' (plain markup; no control-flow blocks).
   */
  framework?: 'html' | 'vue' | 'svelte' | 'astro' | 'jsx';
  /**
   * Attribute-name aliases applied at emission (jsx dialects): e.g.
   * { class: 'className', for: 'htmlFor' } for React. Applies to shorthand
   * selectors (`.btn` → className="btn") and explicit attributes alike.
   */
  attributeAliases?: Record<string, string>;
  filters?: Record<string, (body: string) => string>;
}

export interface SourceMapping {
  sourceSpan: SourceSpan;    // Original NMBL position
  generatedSpan: SourceSpan;  // Generated HTML position
  metadata?: {
    nodeType: string;
    attributeName?: string;
  };
}

export interface CompileResult {
  html: string;
  mappings: SourceMapping[];
  errors: NmblError[];
}

export class Compiler {
  private indentSize: number;
  private xhtml: boolean;
  private framework: 'html' | 'vue' | 'svelte' | 'astro' | 'jsx';
  private attributeAliases: Record<string, string>;
  private filters: Record<string, (body: string) => string>;

  // Position tracking fields
  private output: string;
  private position: SourcePosition;
  private mappings: SourceMapping[];
  private errors: NmblError[];
  private source: string;  // Original source text for reference

  constructor(options: CompilerOptions = {}) {
    this.indentSize = options.indent ?? 2;
    this.framework = options.framework ?? 'html';
    // JSX requires self-closing void elements (<br />)
    this.xhtml = options.xhtml ?? (this.framework === 'jsx');
    this.attributeAliases = options.attributeAliases ?? {};
    this.filters = options.filters ?? {};

    // Initialize position tracking
    this.output = '';
    this.position = { line: 0, column: 0, offset: 0 };
    this.mappings = [];
    this.errors = [];
    this.source = '';
  }

  compile(doc: DocumentNode): string {
    return this.compileChildren(doc.children, 0);
  }

  compileWithMappings(doc: DocumentNode, source?: string): CompileResult {
    // Reset state for new compilation
    this.output = '';
    this.position = { line: 0, column: 0, offset: 0 };
    this.mappings = [];
    this.errors = [];
    this.source = source || '';
    this.sourceLines = null;

    // Compile children with position tracking
    this.compileChildrenTracked(doc.children, 0);

    return {
      html: this.output,
      mappings: this.mappings,
      errors: this.errors
    };
  }

  // Attribute-name aliasing (jsx dialects: class→className, for→htmlFor)
  private aliasAttr(name: string): string {
    return this.attributeAliases[name] ?? name;
  }

  private spanWithPrefix(span: SourceSpan): SourceSpan {
    // Create a span that starts 1 character earlier (includes the dot/hash prefix)
    return {
      start: {
        line: span.start.line,
        column: Math.max(0, span.start.column - 1),
        offset: Math.max(0, span.start.offset - 1),
      },
      end: span.end,
    };
  }

  private write(text: string, sourceSpan?: SourceSpan, metadata?: { nodeType: string; attributeName?: string }): void {
    if (!text) return;

    const startPos = { ...this.position };

    // Update position as we write
    for (const char of text) {
      if (char === '\n') {
        this.position.line++;
        this.position.column = 0;
      } else {
        this.position.column++;
      }
      this.position.offset++;
    }

    // Record mapping if source span provided
    if (sourceSpan) {
      const endPos = { ...this.position };
      this.mappings.push({
        sourceSpan,
        generatedSpan: { start: startPos, end: endPos },
        metadata
      });
    }

    this.output += text;
  }

  // A blank line between siblings in SOURCE is kept in the OUTPUT (collapsed
  // to one) — the generated markup mirrors the source rhythm. `prevLine` is
  // the SUBTREE end line of the previous sibling (an element's own span stops
  // at its head; the gap is measured from its last descendant). A line-count
  // gap alone isn't enough: a stripped `//` comment occupies lines without
  // being blank, so when the source is available require an actual blank line.
  private sourceLines: string[] | null = null;

  private gapBefore(prevLine: number | null, node: AstNode): boolean {
    if (prevLine === null || !node.span || node.span.start.line - prevLine < 2) return false;
    if (!this.source) return true;
    this.sourceLines ??= this.source.split('\n');
    for (let l = prevLine + 1; l < node.span.start.line; l++) {
      if ((this.sourceLines[l] ?? '').trim() === '') return true;
    }
    return false;
  }

  private subtreeEndLine(node: AstNode): number {
    let end = node.span ? node.span.end.line : 0;
    if ('children' in node && Array.isArray(node.children)) {
      for (const child of node.children) end = Math.max(end, this.subtreeEndLine(child));
    }
    if ('clauses' in node && Array.isArray(node.clauses)) {
      for (const clause of node.clauses) {
        for (const child of clause.children) end = Math.max(end, this.subtreeEndLine(child));
      }
    }
    return end;
  }

  private compileChildren(nodes: AstNode[], depth: number): string {
    const parts: string[] = [];
    let prevLine: number | null = null;
    for (const node of nodes) {
      const result = this.compileNode(node, depth);
      if (result !== null) {
        if (this.gapBefore(prevLine, node)) parts.push('');
        parts.push(result);
      }
      prevLine = this.subtreeEndLine(node);
    }
    return parts.join('\n');
  }

  private compileChildrenTracked(nodes: AstNode[], depth: number): void {
    let first = true;
    let prevLine: number | null = null;
    for (const node of nodes) {
      if (!first && this.output && !this.output.endsWith('\n')) {
        this.write('\n'); // Add newline between nodes
      }
      if (!first && this.gapBefore(prevLine, node)) {
        this.write('\n');
      }
      this.compileNodeTracked(node, depth);
      first = false;
      prevLine = this.subtreeEndLine(node);
    }
  }

  private compileNode(node: AstNode, depth: number): string | null {
    switch (node.type) {
      case 'Element': return this.compileElement(node, depth);
      case 'Text': return this.compileText(node, depth);
      case 'HtmlComment': return this.compileHtmlComment(node, depth);
      case 'ContentBlock': return this.compileContentBlock(node, depth);
      case 'Block': return this.compileBlock(node, depth);
      case 'InlineDirective': return this.compileInlineDirective(node, depth);
    }
  }

  private compileNodeTracked(node: AstNode, depth: number): void {
    switch (node.type) {
      case 'Element':
        this.compileElementTracked(node, depth);
        break;
      case 'Text':
        this.compileTextTracked(node, depth);
        break;
      case 'HtmlComment':
        this.compileHtmlCommentTracked(node, depth);
        break;
      case 'ContentBlock':
        this.compileContentBlockTracked(node, depth);
        break;
      case 'Block':
        this.compileBlockTracked(node, depth);
        break;
      case 'InlineDirective':
        this.compileInlineDirectiveTracked(node, depth);
        break;
    }
  }

  private compileElementTracked(node: ElementNode, depth: number): void {
    const indent = this.getIndent(depth);
    const tag = node.tagName;

    // Write indent (no mapping)
    if (indent) this.write(indent);

    // Write opening tag - only map the tag name, not structural syntax
    this.write('<');
    this.write(tag, node.span, { nodeType: 'Element' });

    // Compile and write attributes
    this.compileAttributesTracked(node);

    // Handle void elements
    if (node.isVoid) {
      if (this.xhtml) {
        this.write(' />');
      } else {
        this.write('>');
      }
      return;
    }

    // JSX: a raw content-mode body (script:, style:, a :md filter's HTML) is not
    // JSX — its braces would parse as expressions and unclosed tags as elements.
    // The only faithful encoding is dangerouslySetInnerHTML on the host element.
    if (node.contentMode && this.framework === 'jsx') {
      const { body } = this.compileContentModeBody(node);
      this.write(` dangerouslySetInnerHTML={{ __html: ${JSON.stringify(body)} }} />`);
      return;
    }

    // Close opening tag
    this.write('>');

    // Content mode: raw text body
    if (node.contentMode) {
      const { body, filtered } = this.compileContentModeBody(node);
      if (body && filtered) {
        // Generated markup (e.g. :md → HTML): indent into the parent and put
        // the body + closing tag on their own lines.
        this.write('\n');
        this.write(this.indentContentBlock(body, this.getIndent(depth + 1)), node.span, { nodeType: 'Element' });
        this.write('\n');
        if (indent) this.write(indent);
      } else if (body) {
        this.write(body, node.span, { nodeType: 'Element' });
      }
      // Write closing tag - structural syntax unmapped
      this.write('</');
      this.write(tag, node.span, { nodeType: 'Element' });
      this.write('>');
      return;
    }

    // No children
    if (node.children.length === 0) {
      this.write('</');
      this.write(tag, node.span, { nodeType: 'Element' });
      this.write('>');
      return;
    }

    // Single text child — inline it
    if (node.children.length === 1 && node.children[0].type === 'Text' && !node.children[0].value.includes('\n')) {
      const textNode = node.children[0] as TextNode;
      const text = this.getTextValue(textNode);
      this.write(text, textNode.span, { nodeType: 'Text' });
      this.write('</');
      this.write(tag, node.span, { nodeType: 'Element' });
      this.write('>');
      return;
    }

    // Block expansion: inline the single child element
    if (node.isBlockExpansion && node.children.length === 1 && node.children[0].type === 'Element') {
      const childElement = node.children[0] as ElementNode;
      // Save current position to check if child is single-line
      const savedOutput = this.output;
      const savedPos = { ...this.position };
      const savedMappings = [...this.mappings];

      // Try to compile child inline (no indent)
      this.compileElementTracked(childElement, 0);

      // Check if result is single-line
      const childOutput = this.output.substring(savedOutput.length);
      if (!childOutput.includes('\n')) {
        // Keep inline version, add closing tag
        this.write('</');
        this.write(tag, node.span, { nodeType: 'Element' });
        this.write('>');
        return;
      }

      // Restore and compile with proper formatting
      this.output = savedOutput;
      this.position = savedPos;
      this.mappings = savedMappings;
    }

    // Multiple children or multi-line text
    this.write('\n');
    this.compileChildNodesTracked(node.children, depth + 1);
    this.write('\n');
    if (indent) this.write(indent);
    this.write('</');
    this.write(tag, node.span, { nodeType: 'Element' });
    this.write('>');
  }

  private compileElement(node: ElementNode, depth: number): string {
    const indent = this.getIndent(depth);
    const tag = node.tagName;
    const attrs = this.compileAttributes(node);
    const attrStr = attrs ? ' ' + attrs : '';

    // Void element
    if (node.isVoid) {
      if (this.xhtml) {
        return `${indent}<${tag}${attrStr} />`;
      }
      return `${indent}<${tag}${attrStr}>`;
    }

    // Content mode: raw text body
    if (node.contentMode) {
      const { body, filtered } = this.compileContentModeBody(node);
      // JSX: raw bodies aren't JSX (braces parse as expressions, unclosed tags as
      // elements) — encode via dangerouslySetInnerHTML on the host element.
      if (this.framework === 'jsx') {
        return `${indent}<${tag}${attrStr} dangerouslySetInnerHTML={{ __html: ${JSON.stringify(body)} }} />`;
      }
      if (!body) {
        return `${indent}<${tag}${attrStr}></${tag}>`;
      }
      if (filtered) {
        // Generated markup: indent into the parent, body + close on own lines.
        const inner = this.indentContentBlock(body, this.getIndent(depth + 1));
        return `${indent}<${tag}${attrStr}>\n${inner}\n${indent}</${tag}>`;
      }
      return `${indent}<${tag}${attrStr}>${body}</${tag}>`;
    }

    // No children
    if (node.children.length === 0) {
      return `${indent}<${tag}${attrStr}></${tag}>`;
    }

    // Single text child — inline it
    if (node.children.length === 1 && node.children[0].type === 'Text' && !node.children[0].value.includes('\n')) {
      const text = this.getTextValue(node.children[0]);
      return `${indent}<${tag}${attrStr}>${text}</${tag}>`;
    }

    // Block expansion: inline the single child element (e.g. `li: a Home`)
    if (node.isBlockExpansion && node.children.length === 1 && node.children[0].type === 'Element') {
      const childHtml = this.compileElement(node.children[0], 0);
      if (!childHtml.includes('\n')) {
        return `${indent}<${tag}${attrStr}>${childHtml.trim()}</${tag}>`;
      }
    }

    // Multiple children or multi-line text
    const childrenStr = this.compileChildNodes(node.children, depth + 1);
    return `${indent}<${tag}${attrStr}>\n${childrenStr}\n${indent}</${tag}>`;
  }

  private compileChildNodesTracked(children: AstNode[], depth: number): void {
    let first = true;
    let prevLine: number | null = null;
    for (const child of children) {
      if (!first) {
        this.write(this.gapBefore(prevLine, child) ? '\n\n' : '\n');
      }

      if (child.type === 'Text') {
        const indent = this.getIndent(depth);
        if (indent) this.write(indent);
        const text = this.getTextValue(child as TextNode);
        this.write(text, child.span, { nodeType: 'Text' });
      } else {
        this.compileNodeTracked(child, depth);
      }
      first = false;
      prevLine = this.subtreeEndLine(child);
    }
  }

  private compileChildNodes(children: AstNode[], depth: number): string {
    const parts: string[] = [];
    let prevLine: number | null = null;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.type === 'Text') {
        if (this.gapBefore(prevLine, child)) parts.push('');
        const text = this.getTextValue(child);
        parts.push(`${this.getIndent(depth)}${text}`);
      } else {
        const result = this.compileNode(child, depth);
        if (result !== null) {
          if (this.gapBefore(prevLine, child)) parts.push('');
          parts.push(result);
        }
      }
      prevLine = this.subtreeEndLine(child);
    }
    return parts.join('\n');
  }

  private compileAttributesTracked(node: ElementNode): void {
    // Merge classes: CSS shorthand classes + static class attribute
    const allClasses = [...node.classes];
    let boundClass: AttributeNode | null = null;
    let staticClassAttr: AttributeNode | null = null;
    const filteredAttrs: AttributeNode[] = [];

    for (const attr of node.attributes) {
      if (!attr.bound && attr.name === 'class' && attr.value) {
        // Static class attr: merge into class list
        allClasses.push(...attr.value.split(/\s+/).filter(Boolean));
        staticClassAttr = attr;  // Keep reference to the attribute for its span
      } else if (attr.bound && attr.name === 'class') {
        boundClass = attr;
      } else {
        filteredAttrs.push(attr);
      }
    }

    // Emit id from CSS shorthand
    if (node.id) {
      this.write(' ');
      const idSourceSpan = node.idSpan || node.span;
      // Include the opening quote in the mapping, aligned with the '#' prefix in NMBL.
      // Vue's CompilerDOM stores value.loc starting at the quote, and Volar adds +1
      // to skip it. By mapping " to #, the +1 correctly skips to the ID content.
      this.write(this.aliasAttr('id') + '=');
      const idSpanWithPrefix = this.spanWithPrefix(idSourceSpan);
      this.write('"' + node.id, idSpanWithPrefix, { nodeType: 'Attribute', attributeName: 'id' });
      this.write('"');
    }

    // Emit merged classes
    if (allClasses.length > 0) {
      this.write(' ');
      this.write(this.aliasAttr('class') + '=');

      // Write each class with its specific source mapping.
      // For CSS shorthand classes, include the HTML quote character in the mapping
      // aligned with the '.' prefix in NMBL. Vue's CompilerDOM stores the attribute
      // value loc starting at the opening quote, and Volar adds +1 to skip it.
      // By mapping " to ., the +1 correctly skips to the class name content.
      const classesToWrite: string[] = [];

      // First, add CSS shorthand classes with their spans
      for (let i = 0; i < node.classes.length; i++) {
        const classSpan = node.classSpans?.[i] || node.span;
        const className = node.classes[i];

        if (i === 0) {
          // First class: include opening quote mapped to the dot prefix
          const spanWithDot = this.spanWithPrefix(classSpan);
          this.write('"' + className, spanWithDot, { nodeType: 'Attribute', attributeName: 'class' });
        } else {
          // Subsequent classes: space separator maps to the dot between classes
          const spanWithDot = this.spanWithPrefix(classSpan);
          this.write(' ' + className, spanWithDot, { nodeType: 'Attribute', attributeName: 'class' });
        }
        classesToWrite.push(className);
      }

      // Then add any additional classes from static class attributes
      const additionalClasses = allClasses.filter(c => !node.classes.includes(c));
      for (const className of additionalClasses) {
        if (classesToWrite.length > 0) this.write(' ');

        // For static class attributes, we need to find the value span properly
        if (staticClassAttr) {
          const valueStart = this.findQuoteInAttribute(staticClassAttr);
          if (valueStart >= 0) {
            const valueEnd = Math.min(valueStart + staticClassAttr.value!.length + 2, staticClassAttr.span.end.offset);
            const valueSpan = span(
              this.calculatePosition(valueStart),
              this.calculatePosition(valueEnd)
            );
            if (classesToWrite.length === 0) {
              // First class overall (no shorthand classes), include the opening quote
              this.write('"' + className, valueSpan, { nodeType: 'Attribute', attributeName: 'class' });
            } else {
              this.write(className, valueSpan, { nodeType: 'Attribute', attributeName: 'class' });
            }
          } else {
            // Fallback: use full attribute span
            const classSpan = staticClassAttr.span;
            if (classesToWrite.length === 0) {
              this.write('"' + className, classSpan, { nodeType: 'Attribute', attributeName: 'class' });
            } else {
              this.write(className, classSpan, { nodeType: 'Attribute', attributeName: 'class' });
            }
          }
        } else {
          // No static class attr, use node span as fallback
          const classSpan = node.span;
          if (classesToWrite.length === 0) {
            this.write('"' + className, classSpan, { nodeType: 'Attribute', attributeName: 'class' });
          } else {
            this.write(className, classSpan, { nodeType: 'Attribute', attributeName: 'class' });
          }
        }
        classesToWrite.push(className);
      }

      // Opening quote for case with no classes at all (shouldn't happen, but safety)
      if (classesToWrite.length === 0) {
        this.write('"');
      }

      this.write('"');
    }

    // Emit bound class separately
    if (boundClass) {
      this.write(' ');
      this.compileAttributeTracked(boundClass);
    }

    // Emit remaining attributes
    for (const attr of filteredAttrs) {
      this.write(' ');
      this.compileAttributeTracked(attr);
    }
  }

  private compileAttributeTracked(attr: AttributeNode): void {
    const prefix = attr.bound ? ':' : '';
    const name = this.aliasAttr(attr.name);

    if (attr.value === null) {
      // Boolean attribute - map the whole thing
      this.write(prefix + name, attr.span, { nodeType: 'Attribute', attributeName: attr.name });
      return;
    }

    // Map the attribute name
    const nameEndOffset = attr.span.start.offset + (prefix ? 1 : 0) + attr.name.length;
    const nameSpan = span(
      attr.span.start,
      this.calculatePosition(nameEndOffset)
    );
    this.write(prefix + name, nameSpan, { nodeType: 'Attribute', attributeName: attr.name });
    this.write('=');

    // Find where the value starts (at the opening quote/brace/backtick)
    const valueStartOffset = this.findQuoteInAttribute(attr);

    // If we couldn't find the value start, fall back to using the whole attribute span
    if (valueStartOffset < 0) {
      // Fallback: use the entire attribute span
      if (attr.expression) {
        this.write(attr.value, attr.span, { nodeType: 'Attribute', attributeName: attr.name });
      } else if (attr.templateLiteral) {
        this.write('"');
        this.write('`' + attr.value + '`', attr.span, { nodeType: 'Attribute', attributeName: attr.name });
        this.write('"');
      } else {
        this.write('"' + attr.value, attr.span, { nodeType: 'Attribute', attributeName: attr.name });
        this.write('"');
      }
      return;
    }

    // Calculate the value end offset based on the actual value content
    let valueEndOffset: number;
    if (attr.expression) {
      // Expression: {...} - includes the braces
      valueEndOffset = valueStartOffset + attr.value.length;
    } else if (attr.templateLiteral) {
      // Template literal: `...` - we include the backticks in the value
      valueEndOffset = valueStartOffset + attr.value.length + 2; // +2 for backticks
    } else {
      // Regular string: "..." or '...' - valueStartOffset points to opening quote
      // Need to include: opening quote (1) + value content + closing quote (1)
      valueEndOffset = valueStartOffset + attr.value.length + 2; // +2 for both quotes
    }

    // Ensure we don't go past the attribute span end
    valueEndOffset = Math.min(valueEndOffset, attr.span.end.offset);

    // Calculate proper line and column positions from the source
    const valueStartPos = this.calculatePosition(valueStartOffset);
    const valueEndPos = this.calculatePosition(valueEndOffset);

    const valueSpan = span(valueStartPos, valueEndPos);

    if (attr.expression) {
      // Expression: no quotes, map the raw expression
      this.write(attr.value, valueSpan, { nodeType: 'Attribute', attributeName: attr.name });
      return;
    }

    if (attr.templateLiteral) {
      // Template literal: include opening quote in mapping for proper alignment.
      // Vue's CompilerDOM stores value.loc starting at the quote.
      this.write('"');
      this.write('`' + attr.value + '`', valueSpan, { nodeType: 'Attribute', attributeName: attr.name });
      this.write('"');
      return;
    }

    // Regular attribute: include opening quote in the mapping.
    // Vue's CompilerDOM stores the attribute value loc starting at the opening quote,
    // and Volar adds +1 to skip it. By including the quote in our mapping, the positions align.
    this.write('"' + attr.value, valueSpan, { nodeType: 'Attribute', attributeName: attr.name });
    this.write('"');
  }

  private findQuoteInAttribute(attr: AttributeNode): number {
    // Find the position of the opening quote within the attribute span
    if (!this.source) return -1;

    const attrText = this.source.substring(attr.span.start.offset, attr.span.end.offset);

    if (attr.expression) {
      // Expression: find opening brace
      const bracePos = attrText.indexOf('{');
      return bracePos >= 0 ? attr.span.start.offset + bracePos : -1;
    }

    if (attr.templateLiteral) {
      // Template literal: find backtick
      const backtickPos = attrText.indexOf('`');
      return backtickPos >= 0 ? attr.span.start.offset + backtickPos : -1;
    }

    // Regular string: find opening quote (either " or ')
    const doubleQuotePos = attrText.indexOf('"');
    const singleQuotePos = attrText.indexOf("'");

    if (doubleQuotePos >= 0 && (singleQuotePos < 0 || doubleQuotePos < singleQuotePos)) {
      return attr.span.start.offset + doubleQuotePos;
    }
    if (singleQuotePos >= 0) {
      return attr.span.start.offset + singleQuotePos;
    }

    return -1;
  }

  private calculatePosition(offset: number): SourcePosition {
    // Calculate line and column from offset in source text
    if (!this.source || offset < 0) {
      return { line: 0, column: 0, offset };
    }

    let line = 0;
    let column = 0;

    for (let i = 0; i < offset && i < this.source.length; i++) {
      if (this.source[i] === '\n') {
        line++;
        column = 0;
      } else {
        column++;
      }
    }

    return { line, column, offset };
  }

  private compileAttributes(node: ElementNode): string {
    const parts: string[] = [];

    // Merge classes: CSS shorthand classes + static class attribute
    const allClasses = [...node.classes];
    let boundClass: AttributeNode | null = null;
    const filteredAttrs: AttributeNode[] = [];

    for (const attr of node.attributes) {
      if (!attr.bound && attr.name === 'class' && attr.value) {
        // Static class attr: merge into class list
        allClasses.push(...attr.value.split(/\s+/).filter(Boolean));
      } else if (attr.bound && attr.name === 'class') {
        boundClass = attr;
      } else {
        filteredAttrs.push(attr);
      }
    }

    // Emit id from CSS shorthand
    if (node.id) {
      parts.push(`${this.aliasAttr('id')}="${node.id}"`);
    }

    // Emit merged classes
    if (allClasses.length > 0) {
      parts.push(`${this.aliasAttr('class')}="${allClasses.join(' ')}"`);
    }

    // Emit bound class separately
    if (boundClass) {
      parts.push(this.compileAttribute(boundClass));
    }

    // Emit remaining attributes
    for (const attr of filteredAttrs) {
      parts.push(this.compileAttribute(attr));
    }

    return parts.join(' ');
  }

  private compileAttribute(attr: AttributeNode): string {
    const prefix = attr.bound ? ':' : '';
    const name = this.aliasAttr(attr.name);

    if (attr.value === null) {
      // Boolean attribute
      return `${prefix}${name}`;
    }

    if (attr.expression) {
      return `${prefix}${name}=${attr.value}`;
    }

    if (attr.templateLiteral) {
      return `${prefix}${name}="\`${attr.value}\`"`;
    }

    return `${prefix}${name}="${attr.value}"`;
  }

  private compileTextTracked(node: TextNode, depth: number): void {
    const indent = this.getIndent(depth);
    if (indent) this.write(indent);
    const value = node.preserveTrailingWhitespace ? node.value + ' ' : node.value;
    this.write(value, node.span, { nodeType: 'Text' });
  }

  private compileText(node: TextNode, depth: number): string {
    const indent = this.getIndent(depth);
    const value = node.preserveTrailingWhitespace ? node.value + ' ' : node.value;
    return `${indent}${value}`;
  }

  private getTextValue(node: TextNode): string {
    return node.preserveTrailingWhitespace ? node.value + ' ' : node.value;
  }

  private compileHtmlCommentTracked(node: HtmlCommentNode, depth: number): void {
    const indent = this.getIndent(depth);
    if (indent) this.write(indent);

    // JSX has no HTML comments — rendered comments become brace comments.
    if (this.framework === 'jsx') {
      const value = node.value.split('*/').join('*\u200B/');
      this.write('{/* ', node.span, { nodeType: 'HtmlComment' });
      this.write(value, node.span, { nodeType: 'HtmlComment' });
      this.write(' */}', node.span, { nodeType: 'HtmlComment' });
      return;
    }

    if (node.value.includes('\n')) {
      // Multi-line comment
      this.write('<!--', node.span, { nodeType: 'HtmlComment' });
      this.write('\n');
      const innerIndent = this.getIndent(depth + 1);
      const lines = node.value.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]) {
          if (innerIndent) this.write(innerIndent);
          this.write(lines[i], node.span, { nodeType: 'HtmlComment' });
        }
        if (i < lines.length - 1) this.write('\n');
      }
      this.write('\n');
      if (indent) this.write(indent);
      this.write('-->', node.span, { nodeType: 'HtmlComment' });
    } else {
      // Single-line comment
      this.write('<!-- ', node.span, { nodeType: 'HtmlComment' });
      this.write(node.value, node.span, { nodeType: 'HtmlComment' });
      this.write(' -->', node.span, { nodeType: 'HtmlComment' });
    }
  }

  private compileHtmlComment(node: HtmlCommentNode, depth: number): string {
    const indent = this.getIndent(depth);
    if (this.framework === 'jsx') {
      const value = node.value.split('*/').join('*\u200B/');
      return `${indent}{/* ${value} */}`;
    }
    if (node.value.includes('\n')) {
      const innerIndent = this.getIndent(depth + 1);
      const body = node.value.split('\n').map(line => line ? `${innerIndent}${line}` : '').join('\n');
      return `${indent}<!--\n${body}\n${indent}-->`;
    }
    return `${indent}<!-- ${node.value} -->`;
  }

  // A bare content block has no host element to carry dangerouslySetInnerHTML,
  // so its raw body cannot be expressed in JSX at all — error with the fix.
  private reportBareContentBlockJsx(node: ContentBlockNode): void {
    this.errors.push(createError(
      ErrorCode.UnexpectedToken,
      `a bare \`:${node.mode}\` content block is not supported in jsx — attach it to an element (e.g. \`div:${node.mode}\`) so the body can compile to dangerouslySetInnerHTML`,
      node.span,
    ));
  }

  private compileContentBlockTracked(node: ContentBlockNode, depth: number): void {
    if (this.framework === 'jsx') {
      this.reportBareContentBlockJsx(node);
      return;
    }
    const indent = this.getIndent(depth);
    if (indent) this.write(indent);
    const filter = this.filters[node.mode];
    const body = filter ? filter(node.body) : node.body;
    this.write(body, node.span, { nodeType: 'ContentBlock' });
  }

  private compileContentBlock(node: ContentBlockNode, depth: number): string {
    if (this.framework === 'jsx') {
      this.reportBareContentBlockJsx(node);
      return '';
    }
    const indent = this.getIndent(depth);
    const filter = this.filters[node.mode];
    const body = filter ? filter(node.body) : node.body;
    return `${indent}${body}`;
  }

  private compileContentModeBody(node: ElementNode): { body: string; filtered: boolean } {
    // Gather text content from children
    const textChildren = node.children.filter((c): c is TextNode => c.type === 'Text');
    if (textChildren.length === 0) return { body: '', filtered: false };

    const raw = textChildren.map(t => t.value).join('\n');
    const filter = node.contentMode ? this.filters[node.contentMode] : null;
    // Raw bodies (script:/style:) are emitted verbatim — their whitespace is the
    // source text. Filtered bodies (:md → HTML) are generated markup, free to
    // indent to match the surrounding structure.
    return filter ? { body: filter(raw), filtered: true } : { body: raw, filtered: false };
  }

  // Pretty-print a filtered content block (e.g. :md → HTML) so it nests inside
  // its parent — block elements indent their children, preformatted regions stay
  // verbatim — instead of sitting flat at column 0.
  private indentContentBlock(html: string, indent: string): string {
    return formatHtml(html, {
      baseIndent: indent,
      unit: this.getIndent(1),
      xhtml: this.xhtml,
    });
  }

  private getIndent(depth: number): string {
    if (this.indentSize === 0) return '';
    return ' '.repeat(depth * this.indentSize);
  }

  // ─── Control Flow Block Compilation ──────────────────────

  private compileBlockTracked(node: BlockNode, depth: number): void {
    this.checkBlockAttributes(node);
    if (node.blockType === 'each') this.injectJsxKey(node);
    if (this.framework === 'astro' || this.framework === 'jsx') {
      this.compileBlockAstroTracked(node, depth);
    } else if (this.framework === 'svelte') {
      this.compileBlockSvelteTracked(node, depth);
    } else if (this.framework === 'vue') {
      this.compileBlockVueTracked(node, depth);
    } else {
      this.reportBlockUnsupported(node);
    }
  }

  // @-blocks are a thin skin over the HOST framework's block syntax — in
  // plain HTML there is none.
  private reportBlockUnsupported(node: BlockNode): void {
    const hint = this.framework === 'vue'
      ? `Vue supports @if/@elseif/@else and @each (compiled to <template v-if/v-for> wrappers)`
      : `control-flow blocks need a framework target (framework: 'vue' | 'svelte' | 'astro')`;
    this.errors.push(createError(
      ErrorCode.UnexpectedToken,
      `@${node.blockType} is not supported with framework '${this.framework}' — ${hint}`,
      node.span,
    ));
  }

  // ── Vue: @-blocks compile to renderless <template> wrappers carrying the
  //    native directive — @if → <template v-if="…">, @each → <template
  //    v-for="…"> (+ wrapper attributes like :key from the comma section). ──

  private vueDirectiveFor(blockType: string, clauseType: string | null): string | null {
    if (blockType === 'each') return 'v-for';
    if (blockType !== 'if') return null;
    if (clauseType === null) return 'v-if';
    if (clauseType === 'else if') return 'v-else-if';
    if (clauseType === 'else') return 'v-else';
    return null;
  }

  // Quote an expression as an HTML attribute value (escape double quotes).
  private vueAttrValue(expr: string): string {
    return expr.replace(/"/g, '&quot;');
  }

  private compileBlockVueTracked(node: BlockNode, depth: number): void {
    if (node.blockType !== 'if' && node.blockType !== 'each') {
      this.reportBlockUnsupported(node);
      return;
    }
    const indent = this.getIndent(depth);

    for (let i = 0; i < node.clauses.length; i++) {
      const clause = node.clauses[i];
      const directive = this.vueDirectiveFor(node.blockType, i === 0 ? null : clause.clauseType);
      const span = i === 0 ? node.span : clause.span;
      if (directive === null) {
        this.errors.push(createError(
          ErrorCode.UnexpectedToken,
          `@${clause.clauseType ?? node.blockType} clause is not supported with framework 'vue'`,
          clause.span,
        ));
        continue;
      }
      let expression: string | null = clause.expression;
      if (node.blockType === 'each') {
        expression = this.vueEachExpression(node);
        if (expression === null) return;
      }
      // `@if`/`@elseif` conditions pass through verbatim, so map them to the real
      // expression span (not the `@if(` keyword). `@each` is reordered into a
      // `v-for` expression whose positions don't line up — keep it on the block
      // span and let consumers remap the iteration bindings.
      const exprSpan = node.blockType === 'each' ? span : (clause.expressionSpan ?? span);
      if (i > 0) this.write('\n');
      if (indent) this.write(indent);
      this.write('<template ');
      this.write(directive, span, { nodeType: 'Block' });
      if (expression) {
        this.write('="');
        this.write(this.vueAttrValue(expression), exprSpan, { nodeType: 'Block' });
        this.write('"');
      }
      if (node.blockType === 'each' && node.each?.key) {
        this.write(' :key="');
        this.write(this.vueAttrValue(node.each.key), span, { nodeType: 'Block' });
        this.write('"');
      }
      if (i === 0 && node.attributes) {
        for (const attr of node.attributes) {
          this.write(' ');
          this.compileAttributeTracked(attr);
        }
      }
      this.write('>');
      if (clause.children.length) {
        this.write('\n');
        this.compileChildNodesTracked(clause.children, depth + 1);
      }
      this.write('\n');
      if (indent) this.write(indent);
      this.write('</template>');
    }
  }

  private compileBlockVue(node: BlockNode, depth: number): string {
    if (node.blockType !== 'if' && node.blockType !== 'each') {
      this.reportBlockUnsupported(node);
      return '';
    }
    const indent = this.getIndent(depth);
    const parts: string[] = [];

    for (let i = 0; i < node.clauses.length; i++) {
      const clause = node.clauses[i];
      const directive = this.vueDirectiveFor(node.blockType, i === 0 ? null : clause.clauseType);
      if (directive === null) {
        this.errors.push(createError(
          ErrorCode.UnexpectedToken,
          `@${clause.clauseType ?? node.blockType} clause is not supported with framework 'vue'`,
          clause.span,
        ));
        continue;
      }
      let expression: string | null = clause.expression;
      if (node.blockType === 'each') {
        expression = this.vueEachExpression(node);
        if (expression === null) return '';
      }
      const keyStr = node.blockType === 'each' && node.each?.key
        ? ` :key="${this.vueAttrValue(node.each.key)}"` : '';
      const exprStr = (expression ? `="${this.vueAttrValue(expression)}"` : '') + keyStr;
      const attrStr = i === 0 && node.attributes
        ? node.attributes.map(a => ' ' + this.compileAttribute(a)).join('')
        : '';
      const open = `${indent}<template ${directive}${exprStr}${attrStr}>`;
      const body = clause.children.length ? this.compileChildNodes(clause.children, depth + 1) : '';
      parts.push(body ? `${open}\n${body}\n${indent}</template>` : `${open}</template>`);
    }
    return parts.join('\n');
  }

  private compileBlockSvelteTracked(node: BlockNode, depth: number): void {
    const indent = this.getIndent(depth);

    // Opening: {#blockType expression}
    const expression = node.blockType === 'each' ? this.svelteEachExpression(node) : node.expression;
    if (indent) this.write(indent);
    this.write('{#', node.span, { nodeType: 'Block' });
    this.write(node.blockType, node.span, { nodeType: 'Block' });
    if (expression) {
      this.write(' ', node.span, { nodeType: 'Block' });
      this.write(expression, node.span, { nodeType: 'Block' });
    }
    this.write('}', node.span, { nodeType: 'Block' });

    // First clause children
    if (node.clauses[0]?.children.length) {
      this.write('\n');
      this.compileChildNodesTracked(node.clauses[0].children, depth + 1);
    }

    // Continuation clauses
    for (let i = 1; i < node.clauses.length; i++) {
      const clause = node.clauses[i];
      this.write('\n');
      if (indent) this.write(indent);
      this.write('{:', clause.span, { nodeType: 'Block' });
      this.write(clause.clauseType || '', clause.span, { nodeType: 'Block' });
      if (clause.expression) {
        this.write(' ', clause.span, { nodeType: 'Block' });
        this.write(clause.expression, clause.span, { nodeType: 'Block' });
      }
      this.write('}', clause.span, { nodeType: 'Block' });
      if (clause.children.length) {
        this.write('\n');
        this.compileChildNodesTracked(clause.children, depth + 1);
      }
    }

    // Closing: {/blockType}
    this.write('\n');
    if (indent) this.write(indent);
    this.write('{/', node.span, { nodeType: 'Block' });
    this.write(node.blockType, node.span, { nodeType: 'Block' });
    this.write('}', node.span, { nodeType: 'Block' });
  }

  private compileBlockAstroTracked(node: BlockNode, depth: number): void {
    const indent = this.getIndent(depth);

    if (node.blockType === 'if') {
      this.compileIfAstroTracked(node, depth);
    } else if (node.blockType === 'each') {
      this.compileEachAstroTracked(node, depth);
    } else {
      // Astro has no analogue for @await/@key/@snippet — hard error, never a
      // silent comment in the output.
      this.errors.push(createError(
        ErrorCode.UnexpectedToken,
        `@${node.blockType} is not supported with framework '${this.framework}' — only @if/@else/@elseif and @each compile to JSX expressions`,
        node.span,
      ));
      if (indent) this.write(indent);
    }
  }

  // JSX lists key the iteration ROOT element: @each's :key becomes a
  // key={expr} attribute on the body's single root element (jsx mode only).
  private injectJsxKey(node: BlockNode): void {
    if (this.framework !== 'jsx' || !node.each?.key) return;
    const roots = node.clauses[0]?.children ?? [];
    if (roots.length !== 1 || roots[0].type !== 'Element') {
      this.errors.push(createError(
        ErrorCode.UnexpectedToken,
        `@each :key in jsx mode requires a single root element in the loop body (the key lands on it)`,
        node.span,
      ));
      return;
    }
    const root = roots[0];
    if (!root.attributes.some(a => a.name === 'key')) {
      root.attributes.unshift({
        type: 'Attribute', name: 'key', value: `{${node.each.key}}`,
        bound: false, templateLiteral: false, expression: true, span: node.span,
      });
    }
  }

  // Wrapper attributes (`@each(item in items :key="…")`) only exist for hosts
  // whose blocks compile to a wrapper element (Vue). Anywhere else they would
  // be silently dropped — error instead.
  private checkBlockAttributes(node: BlockNode): void {
    if (node.attributes && this.framework !== 'vue') {
      this.errors.push(createError(
        ErrorCode.UnexpectedToken,
        `Block wrapper attributes are only supported with framework 'vue' (they become attributes on the <template> wrapper)`,
        node.span,
      ));
    }
  }

  private compileBlock(node: BlockNode, depth: number): string {
    this.checkBlockAttributes(node);
    if (node.blockType === 'each') this.injectJsxKey(node);
    if (this.framework === 'astro' || this.framework === 'jsx') {
      return this.compileBlockAstro(node, depth);
    }
    if (this.framework === 'svelte') {
      return this.compileBlockSvelte(node, depth);
    }
    if (this.framework === 'vue') {
      return this.compileBlockVue(node, depth);
    }
    this.reportBlockUnsupported(node);
    return '';
  }

  private compileBlockSvelte(node: BlockNode, depth: number): string {
    const indent = this.getIndent(depth);
    const parts: string[] = [];

    // Opening: {#blockType expression}
    const expression = node.blockType === 'each' ? this.svelteEachExpression(node) : node.expression;
    const expr = expression ? ` ${expression}` : '';
    parts.push(`${indent}{#${node.blockType}${expr}}`);

    // First clause children
    if (node.clauses[0]?.children.length) {
      parts.push(this.compileChildNodes(node.clauses[0].children, depth + 1));
    }

    // Continuation clauses
    for (let i = 1; i < node.clauses.length; i++) {
      const clause = node.clauses[i];
      const clauseExpr = clause.expression ? ` ${clause.expression}` : '';
      parts.push(`${indent}{:${clause.clauseType}${clauseExpr}}`);
      if (clause.children.length) {
        parts.push(this.compileChildNodes(clause.children, depth + 1));
      }
    }

    // Closing: {/blockType}
    parts.push(`${indent}{/${node.blockType}}`);

    return parts.join('\n');
  }

  private compileBlockAstro(node: BlockNode, depth: number): string {
    const indent = this.getIndent(depth);

    if (node.blockType === 'if') {
      return this.compileIfAstro(node, depth);
    }

    if (node.blockType === 'each') {
      return this.compileEachAstro(node, depth);
    }

    // Astro has no analogue for @await/@key/@snippet — hard error.
    this.errors.push(createError(
      ErrorCode.UnexpectedToken,
      `@${node.blockType} is not supported with framework 'astro' — only @if/@else/@elseif and @each compile to Astro JSX`,
      node.span,
    ));
    return indent;
  }

  private compileIfAstroTracked(node: BlockNode, depth: number): void {
    const indent = this.getIndent(depth);
    const clauses = node.clauses;

    // Collect if/else-if/else chains
    const conditions: { expression: string; children: AstNode[]; span: SourceSpan }[] = [];
    let elseClause: { children: AstNode[]; span: SourceSpan } | null = null;

    // First clause is the if condition
    conditions.push({
      expression: node.expression,
      children: clauses[0]?.children ?? [],
      span: node.span
    });

    for (let i = 1; i < clauses.length; i++) {
      const clause = clauses[i];
      if (clause.clauseType === 'else if') {
        conditions.push({
          expression: clause.expression,
          children: clause.children,
          span: clause.span
        });
      } else if (clause.clauseType === 'else') {
        elseClause = { children: clause.children, span: clause.span };
      }
    }

    if (conditions.length === 1 && !elseClause) {
      // Simple: {cond && (\n...\n)}
      if (indent) this.write(indent);
      this.write('{', node.span, { nodeType: 'Block' });
      this.write(conditions[0].expression, node.span, { nodeType: 'Block' });
      this.write(' && (', node.span, { nodeType: 'Block' });
      this.write('\n');
      this.compileChildNodesTracked(conditions[0].children, depth + 1);
      this.write('\n');
      if (indent) this.write(indent);
      this.write(')}', node.span, { nodeType: 'Block' });
      return;
    }

    // Ternary chain
    this.buildTernaryChainTracked(conditions, elseClause, depth);
  }

  private buildTernaryChainTracked(
    conditions: { expression: string; children: AstNode[]; span: SourceSpan }[],
    elseClause: { children: AstNode[]; span: SourceSpan } | null,
    depth: number,
    isNested: boolean = false,
  ): void {
    const indent = isNested ? '' : this.getIndent(depth);

    if (conditions.length === 1) {
      if (indent) this.write(indent);
      if (!isNested) this.write('{', conditions[0].span, { nodeType: 'Block' });
      this.write(conditions[0].expression, conditions[0].span, { nodeType: 'Block' });
      if (elseClause) {
        this.write(' ? (', conditions[0].span, { nodeType: 'Block' });
        this.write('\n');
        this.compileChildNodesTracked(conditions[0].children, depth + 1);
        this.write('\n');
        this.write(this.getIndent(depth));
        this.write(') : (', conditions[0].span, { nodeType: 'Block' });
        this.write('\n');
        this.compileChildNodesTracked(elseClause.children, depth + 1);
        this.write('\n');
        this.write(this.getIndent(depth));
        this.write(')', elseClause.span, { nodeType: 'Block' });
        if (!isNested) this.write('}', elseClause.span, { nodeType: 'Block' });
      } else {
        this.write(' && (', conditions[0].span, { nodeType: 'Block' });
        this.write('\n');
        this.compileChildNodesTracked(conditions[0].children, depth + 1);
        this.write('\n');
        this.write(this.getIndent(depth));
        this.write(')', conditions[0].span, { nodeType: 'Block' });
        if (!isNested) this.write('}', conditions[0].span, { nodeType: 'Block' });
      }
      return;
    }

    // Multiple conditions: nested ternary
    const first = conditions[0];
    const rest = conditions.slice(1);
    if (indent) this.write(indent);
    if (!isNested) this.write('{', first.span, { nodeType: 'Block' });
    this.write(first.expression, first.span, { nodeType: 'Block' });
    this.write(' ? (', first.span, { nodeType: 'Block' });
    this.write('\n');
    this.compileChildNodesTracked(first.children, depth + 1);
    this.write('\n');
    this.write(this.getIndent(depth));
    this.write(') : ', first.span, { nodeType: 'Block' });

    // Build nested ternary - it's inline in the else clause, so isNested = true
    this.buildTernaryChainTracked(rest, elseClause, depth, true);

    // Close the outer expression if not nested
    if (!isNested) this.write('}', first.span, { nodeType: 'Block' });
  }

  private compileIfAstro(node: BlockNode, depth: number): string {
    const indent = this.getIndent(depth);
    const clauses = node.clauses;

    // Collect if/else-if/else chains
    const conditions: { expression: string; children: AstNode[] }[] = [];
    let elseClause: AstNode[] | null = null;

    // First clause is the if condition
    conditions.push({ expression: node.expression, children: clauses[0]?.children ?? [] });

    for (let i = 1; i < clauses.length; i++) {
      const clause = clauses[i];
      if (clause.clauseType === 'else if') {
        conditions.push({ expression: clause.expression, children: clause.children });
      } else if (clause.clauseType === 'else') {
        elseClause = clause.children;
      }
    }

    if (conditions.length === 1 && !elseClause) {
      // Simple: {cond && (\n...\n)}
      const body = this.compileChildNodes(conditions[0].children, depth + 1);
      return `${indent}{${conditions[0].expression} && (\n${body}\n${indent})}`;
    }

    // Ternary chain
    return this.buildTernaryChain(conditions, elseClause, depth);
  }

  private buildTernaryChain(
    conditions: { expression: string; children: AstNode[] }[],
    elseClause: AstNode[] | null,
    depth: number,
  ): string {
    const indent = this.getIndent(depth);

    if (conditions.length === 1) {
      const body = this.compileChildNodes(conditions[0].children, depth + 1);
      if (elseClause) {
        const elseBody = this.compileChildNodes(elseClause, depth + 1);
        return `${indent}{${conditions[0].expression} ? (\n${body}\n${indent}) : (\n${elseBody}\n${indent})}`;
      }
      const bodyStr = this.compileChildNodes(conditions[0].children, depth + 1);
      return `${indent}{${conditions[0].expression} && (\n${bodyStr}\n${indent})}`;
    }

    // Multiple conditions: nested ternary
    const first = conditions[0];
    const rest = conditions.slice(1);
    const body = this.compileChildNodes(first.children, depth + 1);
    const nested = this.buildTernaryChain(rest, elseClause, depth);
    // Strip leading indent from nested since it's inline
    const nestedTrimmed = nested.trimStart();
    return `${indent}{${first.expression} ? (\n${body}\n${indent}) : ${nestedTrimmed}}`;
  }

  // Structured @each parts for function-style hosts (Astro JSX / .map()).
  // Vue's 3-binding object-iteration form has no analogue here.
  private eachParts(node: BlockNode): { collection: string; params: string } | null {
    if (!node.each) {
      this.errors.push(createError(
        ErrorCode.UnexpectedToken,
        `Could not parse @each expression '${node.expression}' — use 'item of items' or 'items as item'`,
        node.span,
      ));
      return null;
    }
    if (node.each.bindings.length > 2) {
      this.errors.push(createError(
        ErrorCode.UnexpectedToken,
        `@each with ${node.each.bindings.length} bindings is not supported with framework '${this.framework}' (object iteration is Vue-only)`,
        node.span,
      ));
      return null;
    }
    return { collection: node.each.collection, params: node.each.bindings.join(', ') };
  }

  // The Svelte-native each expression, reconstructed from the structured
  // parts (either input form normalizes here): `items as item, i (item.id)`.
  private svelteEachExpression(node: BlockNode): string {
    if (!node.each) return node.expression;   // leniency: svelte validates
    if (node.each.bindings.length > 2) {
      this.errors.push(createError(
        ErrorCode.UnexpectedToken,
        `@each with ${node.each.bindings.length} bindings is not supported with framework 'svelte' (object iteration is Vue-only)`,
        node.span,
      ));
    }
    const key = node.each.key ? ` (${node.each.key})` : '';
    return `${node.each.collection} as ${node.each.bindings.join(', ')}${key}`;
  }

  // The Vue-native v-for expression: `(item, i) of items`.
  private vueEachExpression(node: BlockNode): string | null {
    if (!node.each) {
      this.errors.push(createError(
        ErrorCode.UnexpectedToken,
        `Could not parse @each expression '${node.expression}' — use 'item of items' or 'items as item'`,
        node.span,
      ));
      return null;
    }
    const b = node.each.bindings;
    const lhs = b.length === 1 && !b[0].includes(',') ? b[0] : `(${b.join(', ')})`;
    return `${lhs} of ${node.each.collection}`;
  }

  private compileEachAstroTracked(node: BlockNode, depth: number): void {
    const indent = this.getIndent(depth);

    const parsed = this.eachParts(node);
    if (!parsed) return;
    const { collection, params } = parsed;

    if (indent) this.write(indent);
    this.write('{', node.span, { nodeType: 'Block' });
    this.write(collection, node.span, { nodeType: 'Block' });
    this.write('.map((', node.span, { nodeType: 'Block' });
    this.write(params, node.span, { nodeType: 'Block' });
    this.write(') => (', node.span, { nodeType: 'Block' });
    this.write('\n');
    this.compileChildNodesTracked(node.clauses[0]?.children ?? [], depth + 1);
    this.write('\n');
    if (indent) this.write(indent);
    this.write('))}', node.span, { nodeType: 'Block' });
  }

  private compileEachAstro(node: BlockNode, depth: number): string {
    const indent = this.getIndent(depth);

    const parsed = this.eachParts(node);
    if (!parsed) return '';
    const { collection, params } = parsed;
    const body = this.compileChildNodes(node.clauses[0]?.children ?? [], depth + 1);

    return `${indent}{${collection}.map((${params}) => (\n${body}\n${indent}))}`;
  }

  private compileInlineDirectiveTracked(node: InlineDirectiveNode, depth: number): void {
    const indent = this.getIndent(depth);

    if (this.framework === 'astro') {
      this.compileInlineDirectiveAstroTracked(node, depth);
      return;
    }
    if (this.framework === 'vue' || this.framework === 'html' || this.framework === 'jsx') {
      this.reportInlineDirectiveUnsupported(node);
      return;
    }

    // Svelte: passthrough
    if (indent) this.write(indent);
    this.write('{@', node.span, { nodeType: 'InlineDirective' });
    this.write(node.directiveType, node.span, { nodeType: 'InlineDirective' });
    if (node.expression) {
      this.write(' ', node.span, { nodeType: 'InlineDirective' });
      this.write(node.expression, node.span, { nodeType: 'InlineDirective' });
    }
    this.write('}', node.span, { nodeType: 'InlineDirective' });
  }

  private compileInlineDirectiveAstroTracked(node: InlineDirectiveNode, depth: number): void {
    const indent = this.getIndent(depth);

    if (node.directiveType === 'html') {
      if (indent) this.write(indent);
      this.write('<Fragment set:html={', node.span, { nodeType: 'InlineDirective' });
      this.write(node.expression, node.span, { nodeType: 'InlineDirective' });
      this.write('} />', node.span, { nodeType: 'InlineDirective' });
      return;
    }

    // Other directives: emit as comment
    if (indent) this.write(indent);
    this.write('{/* @', node.span, { nodeType: 'InlineDirective' });
    this.write(node.directiveType, node.span, { nodeType: 'InlineDirective' });
    this.write(' ', node.span, { nodeType: 'InlineDirective' });
    this.write(node.expression, node.span, { nodeType: 'InlineDirective' });
    this.write(' */}', node.span, { nodeType: 'InlineDirective' });
  }

  private compileInlineDirective(node: InlineDirectiveNode, depth: number): string {
    const indent = this.getIndent(depth);

    if (this.framework === 'astro') {
      return this.compileInlineDirectiveAstro(node, depth);
    }
    if (this.framework === 'vue' || this.framework === 'html' || this.framework === 'jsx') {
      this.reportInlineDirectiveUnsupported(node);
      return '';
    }

    // Svelte: passthrough
    const expr = node.expression ? ` ${node.expression}` : '';
    return `${indent}{@${node.directiveType}${expr}}`;
  }

  private reportInlineDirectiveUnsupported(node: InlineDirectiveNode): void {
    const hint = this.framework === 'vue'
      ? `use the v-html attribute instead (e.g. span(v-html="${node.expression}"))`
      : this.framework === 'jsx'
        ? `use dangerouslySetInnerHTML on an element instead`
        : `inline directives need a framework target (framework: 'svelte' | 'astro')`;
    this.errors.push(createError(
      ErrorCode.UnexpectedToken,
      `{@${node.directiveType}} is not supported with framework '${this.framework}' — ${hint}`,
      node.span,
    ));
  }

  private compileInlineDirectiveAstro(node: InlineDirectiveNode, depth: number): string {
    const indent = this.getIndent(depth);

    if (node.directiveType === 'html') {
      return `${indent}<Fragment set:html={${node.expression}} />`;
    }

    // Other directives: emit as comment
    return `${indent}{/* @${node.directiveType} ${node.expression} */}`;
  }
}
