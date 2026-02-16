import type {
  DocumentNode, ElementNode, AttributeNode, TextNode,
  CommentNode, HtmlCommentNode, ContentBlockNode, AstNode,
} from './ast.js';

export interface CompilerOptions {
  indent?: number;
  xhtml?: boolean;
  filters?: Record<string, (body: string) => string>;
}

export class Compiler {
  private indentSize: number;
  private xhtml: boolean;
  private filters: Record<string, (body: string) => string>;

  constructor(options: CompilerOptions = {}) {
    this.indentSize = options.indent ?? 2;
    this.xhtml = options.xhtml ?? false;
    this.filters = options.filters ?? {};
  }

  compile(doc: DocumentNode): string {
    return this.compileChildren(doc.children, 0);
  }

  private compileChildren(nodes: AstNode[], depth: number): string {
    const parts: string[] = [];
    for (const node of nodes) {
      const result = this.compileNode(node, depth);
      if (result !== null) parts.push(result);
    }
    return parts.join('\n');
  }

  private compileNode(node: AstNode, depth: number): string | null {
    switch (node.type) {
      case 'Element': return this.compileElement(node, depth);
      case 'Text': return this.compileText(node, depth);
      case 'Comment': return null; // Silent comments omitted
      case 'HtmlComment': return this.compileHtmlComment(node, depth);
      case 'ContentBlock': return this.compileContentBlock(node, depth);
    }
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
      const body = this.compileContentModeBody(node);
      if (!body) {
        return `${indent}<${tag}${attrStr}></${tag}>`;
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

  private compileChildNodes(children: AstNode[], depth: number): string {
    const parts: string[] = [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.type === 'Text') {
        const text = this.getTextValue(child);
        parts.push(`${this.getIndent(depth)}${text}`);
      } else {
        const result = this.compileNode(child, depth);
        if (result !== null) parts.push(result);
      }
    }
    return parts.join('\n');
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
      parts.push(`id="${node.id}"`);
    }

    // Emit merged classes
    if (allClasses.length > 0) {
      parts.push(`class="${allClasses.join(' ')}"`);
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

    if (attr.value === null) {
      // Boolean attribute
      return `${prefix}${attr.name}`;
    }

    if (attr.templateLiteral) {
      return `${prefix}${attr.name}="\`${attr.value}\`"`;
    }

    return `${prefix}${attr.name}="${attr.value}"`;
  }

  private compileText(node: TextNode, depth: number): string {
    const indent = this.getIndent(depth);
    const value = node.preserveTrailingWhitespace ? node.value + ' ' : node.value;
    return `${indent}${value}`;
  }

  private getTextValue(node: TextNode): string {
    return node.preserveTrailingWhitespace ? node.value + ' ' : node.value;
  }

  private compileHtmlComment(node: HtmlCommentNode, depth: number): string {
    const indent = this.getIndent(depth);
    if (node.value.includes('\n')) {
      return `${indent}<!--\n${node.value}\n${indent}-->`;
    }
    return `${indent}<!-- ${node.value} -->`;
  }

  private compileContentBlock(node: ContentBlockNode, depth: number): string {
    const indent = this.getIndent(depth);
    const filter = this.filters[node.mode];
    const body = filter ? filter(node.body) : node.body;
    return `${indent}${body}`;
  }

  private compileContentModeBody(node: ElementNode): string {
    // Gather text content from children
    const textChildren = node.children.filter((c): c is TextNode => c.type === 'Text');
    if (textChildren.length === 0) return '';

    const body = textChildren.map(t => t.value).join('\n');
    const filter = node.contentMode ? this.filters[node.contentMode] : null;
    return filter ? filter(body) : body;
  }

  private getIndent(depth: number): string {
    if (this.indentSize === 0) return '';
    return ' '.repeat(depth * this.indentSize);
  }
}
