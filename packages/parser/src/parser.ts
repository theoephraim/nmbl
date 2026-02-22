import type { SourcePosition, SourceSpan } from './source-location.js';
import { span } from './source-location.js';
import { TokenType, type Token } from './tokens.js';
import type {
  DocumentNode, ElementNode, AttributeNode, TextNode,
  CommentNode, HtmlCommentNode, ContentBlockNode, AstNode,
  BlockNode, BlockClauseNode, InlineDirectiveNode,
} from './ast.js';
import { ErrorCode, type NmblError, createError } from './errors.js';
import { VOID_ELEMENTS } from './constants.js';

export class Parser {
  private tokens: Token[];
  private pos = 0;
  private errors: NmblError[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): { ast: DocumentNode; errors: NmblError[] } {
    const start = this.current().span.start;
    const children = this.parseBlock();
    const end = this.current().span.end;
    const ast: DocumentNode = { type: 'Document', children, span: span(start, end) };
    return { ast, errors: this.errors };
  }

  // ─── Token Helpers ────────────────────────────────────────

  private current(): Token {
    return this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1]!;
  }

  private peek(): TokenType {
    return this.current().type;
  }

  private advance(): Token {
    const tok = this.current();
    if (this.pos < this.tokens.length - 1) this.pos++;
    return tok;
  }

  private expect(type: TokenType): Token {
    if (this.peek() === type) {
      return this.advance();
    }
    const tok = this.current();
    this.addError(
      ErrorCode.UnexpectedToken,
      `Expected ${type}, got ${tok.type}`,
      tok.span,
    );
    return tok;
  }

  private match(type: TokenType): boolean {
    if (this.peek() === type) {
      this.advance();
      return true;
    }
    return false;
  }

  private addError(code: ErrorCode, message: string, s: SourceSpan): void {
    this.errors.push(createError(code, message, s));
  }

  // ─── Core Parsing ─────────────────────────────────────────

  private parseBlock(): AstNode[] {
    const nodes: AstNode[] = [];

    while (this.peek() !== TokenType.Outdent && this.peek() !== TokenType.EOF) {
      const node = this.parseExpr();
      if (node) nodes.push(node);
    }

    return nodes;
  }

  private parseExpr(): AstNode | null {
    switch (this.peek()) {
      case TokenType.Tag:
        return this.parseElement(false);
      case TokenType.Id:
      case TokenType.Class:
        return this.parseElement(true);
      case TokenType.PipeText:
        return this.parsePipeText();
      case TokenType.Text:
        return this.parseTextNode();
      case TokenType.Comment:
        return this.parseComment(false);
      case TokenType.HtmlComment:
        return this.parseComment(true);
      case TokenType.BlockComment:
        return this.parseBlockComment(false);
      case TokenType.BlockHtmlComment:
        return this.parseBlockComment(true);
      case TokenType.ContentMode:
        return this.parseStandaloneContentBlock();
      case TokenType.BlockOpen:
        return this.parseBlock_();
      case TokenType.InlineDirective:
        return this.parseInlineDirective();
      case TokenType.BlockContinuation:
        // Continuation without a matching block open — error recovery
        this.addError(ErrorCode.UnexpectedToken, 'Unexpected block continuation without matching block open', this.current().span);
        this.advance();
        return null;
      case TokenType.Newline:
        this.advance();
        return null;
      case TokenType.Indent:
        // Unexpected indent — skip to matching outdent
        this.addError(ErrorCode.UnexpectedToken, 'Unexpected indent', this.current().span);
        this.advance(); // skip indent
        this.parseBlock(); // consume nested content
        if (this.peek() === TokenType.Outdent) this.advance();
        return null;
      default: {
        // Error recovery: skip token
        const tok = this.current();
        this.addError(ErrorCode.UnexpectedToken, `Unexpected token ${tok.type}`, tok.span);
        this.advance();
        return null;
      }
    }
  }

  // ─── Element Parsing ──────────────────────────────────────

  private parseElement(implicitDiv: boolean): ElementNode {
    const start = this.current().span.start;

    let tagName = 'div';
    if (!implicitDiv) {
      const tagToken = this.advance() as Token & { name: string };
      tagName = tagToken.name;
    }

    const isComponent = tagName[0] >= 'A' && tagName[0] <= 'Z';
    const isVoid = VOID_ELEMENTS.has(tagName.toLowerCase());

    let id: string | null = null;
    let idSpan: SourceSpan | undefined;
    const classes: string[] = [];
    const classSpans: SourceSpan[] = [];

    // Consume CSS shorthand (#id, .class)
    while (this.peek() === TokenType.Id || this.peek() === TokenType.Class) {
      const tok = this.advance() as Token & { name: string; span: SourceSpan };
      if (tok.type === TokenType.Id) {
        id = tok.name;
        idSpan = tok.span;
      } else {
        classes.push(tok.name);
        classSpans.push(tok.span);
      }
    }

    // Attributes
    const attributes: AttributeNode[] = [];
    if (this.peek() === TokenType.AttrStart) {
      this.advance(); // consume AttrStart
      while (this.peek() === TokenType.Attribute) {
        const attr = this.advance() as Token & {
          name: string; value: string | null; bound: boolean; templateLiteral: boolean; expression: boolean;
        };
        attributes.push({
          type: 'Attribute',
          name: attr.name,
          value: attr.value,
          bound: attr.bound,
          templateLiteral: attr.templateLiteral,
          expression: attr.expression,
          span: attr.span,
        });
      }
      if (this.peek() === TokenType.AttrEnd) {
        this.advance();
      }
    }

    let children: AstNode[] = [];
    let contentMode: string | null = null;
    let isBlockExpansion = false;

    // Content mode suffix
    if (this.peek() === TokenType.ContentMode) {
      const modeTok = this.advance() as Token & { name: string };
      contentMode = modeTok.name;
      children = this.parseContentChildren();
    }
    // Block expansion (child expansion >)
    else if (this.peek() === TokenType.ChildExpansion) {
      this.advance();
      isBlockExpansion = true;
      const child = this.parseExpr();
      if (child) children.push(child);
    }
    // Inline text
    else if (this.peek() === TokenType.Text) {
      const textTok = this.advance() as Token & { value: string; preserveTrailingWhitespace: boolean };
      children.push({
        type: 'Text',
        value: textTok.value,
        preserveTrailingWhitespace: textTok.preserveTrailingWhitespace,
        span: textTok.span,
      });
      // After inline text, there might also be indented children
      if (this.peek() === TokenType.Indent) {
        this.advance();
        children.push(...this.parseBlock());
        if (this.peek() === TokenType.Outdent) this.advance();
      }
    }
    // Indented children
    else if (this.peek() === TokenType.Indent) {
      this.advance();
      children.push(...this.parseBlock());
      if (this.peek() === TokenType.Outdent) this.advance();
    }

    // Warn if void element has children
    if (isVoid && children.length > 0) {
      this.addError(
        ErrorCode.VoidElementWithChildren,
        `Void element <${tagName}> should not have children`,
        span(start, this.current().span.start),
      );
    }

    const end = this.current().span.start;
    const element: ElementNode = {
      type: 'Element',
      tagName,
      isComponent,
      isVoid,
      isImplicitDiv: implicitDiv,
      isBlockExpansion,
      id,
      classes,
      attributes,
      children,
      contentMode,
      span: span(start, end),
    };

    // Add optional spans if CSS shorthand was used
    if (idSpan) element.idSpan = idSpan;
    if (classSpans.length > 0) element.classSpans = classSpans;

    return element;
  }

  private parseContentChildren(): AstNode[] {
    const lines: string[] = [];

    // Consume ContentText tokens (they come as indented children)
    if (this.peek() === TokenType.Indent) {
      this.advance();
      while (this.peek() === TokenType.ContentText) {
        const tok = this.advance() as Token & { value: string };
        lines.push(tok.value);
      }
      // Also handle any non-content-text tokens that might appear
      while (this.peek() !== TokenType.Outdent && this.peek() !== TokenType.EOF) {
        if (this.peek() === TokenType.ContentText) {
          const tok = this.advance() as Token & { value: string };
          lines.push(tok.value);
        } else {
          break;
        }
      }
      if (this.peek() === TokenType.Outdent) this.advance();
    }

    if (lines.length > 0) {
      const body = lines.join('\n');
      const node: TextNode = {
        type: 'Text',
        value: body,
        preserveTrailingWhitespace: false,
        span: span(this.current().span.start, this.current().span.start),
      };
      return [node];
    }

    return [];
  }

  // ─── Text Parsing ─────────────────────────────────────────

  private parsePipeText(): TextNode {
    const tok = this.advance() as Token & { value: string; preserveTrailingWhitespace: boolean };
    return {
      type: 'Text',
      value: tok.value,
      preserveTrailingWhitespace: tok.preserveTrailingWhitespace,
      span: tok.span,
    };
  }

  private parseTextNode(): TextNode {
    const tok = this.advance() as Token & { value: string; preserveTrailingWhitespace: boolean };
    return {
      type: 'Text',
      value: tok.value,
      preserveTrailingWhitespace: tok.preserveTrailingWhitespace,
      span: tok.span,
    };
  }

  // ─── Comment Parsing ──────────────────────────────────────

  private parseComment(isHtml: boolean): CommentNode | HtmlCommentNode {
    const tok = this.advance() as Token & { value: string };

    // Skip any indented children that the lexer already collected
    if (this.peek() === TokenType.Indent) {
      this.advance();
      this.parseBlock();
      if (this.peek() === TokenType.Outdent) this.advance();
    }

    if (isHtml) {
      return {
        type: 'HtmlComment',
        value: tok.value,
        isBlock: false,
        span: tok.span,
      };
    }
    return {
      type: 'Comment',
      value: tok.value,
      isBlock: false,
      span: tok.span,
    };
  }

  private parseBlockComment(isHtml: boolean): CommentNode | HtmlCommentNode {
    const tok = this.advance() as Token & { value: string };

    if (isHtml) {
      return {
        type: 'HtmlComment',
        value: tok.value,
        isBlock: true,
        span: tok.span,
      };
    }
    return {
      type: 'Comment',
      value: tok.value,
      isBlock: true,
      span: tok.span,
    };
  }

  // ─── Standalone Content Block ─────────────────────────────

  private parseStandaloneContentBlock(): ContentBlockNode {
    const modeTok = this.advance() as Token & { name: string };
    const lines: string[] = [];

    if (this.peek() === TokenType.Indent) {
      this.advance();
      while (this.peek() === TokenType.ContentText) {
        const tok = this.advance() as Token & { value: string };
        lines.push(tok.value);
      }
      if (this.peek() === TokenType.Outdent) this.advance();
    }

    return {
      type: 'ContentBlock',
      mode: modeTok.name,
      body: lines.join('\n'),
      span: modeTok.span,
    };
  }

  // ─── Control Flow Blocks ──────────────────────────────────

  private parseBlock_(): BlockNode {
    const openTok = this.advance() as Token & { blockType: string; expression: string };
    const start = openTok.span.start;

    const clauses: BlockClauseNode[] = [];

    // First clause (from the opening block)
    const firstClauseChildren = this.parseBlockChildren();
    clauses.push({
      type: 'BlockClause',
      clauseType: null,
      expression: openTok.expression,
      children: firstClauseChildren,
      span: openTok.span,
    });

    // Continuation clauses ({:else}, {:then}, {:catch}, {:else if})
    while (this.peek() === TokenType.BlockContinuation) {
      const contTok = this.advance() as Token & { clauseType: string; expression: string };
      const contChildren = this.parseBlockChildren();
      clauses.push({
        type: 'BlockClause',
        clauseType: contTok.clauseType,
        expression: contTok.expression,
        children: contChildren,
        span: contTok.span,
      });
    }

    const end = this.current().span.start;
    return {
      type: 'Block',
      blockType: openTok.blockType,
      expression: openTok.expression,
      clauses,
      span: span(start, end),
    };
  }

  private parseBlockChildren(): AstNode[] {
    if (this.peek() !== TokenType.Indent) {
      return [];
    }
    this.advance(); // consume Indent
    const children = this.parseBlockContent();
    if (this.peek() === TokenType.Outdent) this.advance();
    return children;
  }

  private parseBlockContent(): AstNode[] {
    const nodes: AstNode[] = [];
    while (
      this.peek() !== TokenType.Outdent
      && this.peek() !== TokenType.EOF
      && this.peek() !== TokenType.BlockContinuation
    ) {
      const node = this.parseExpr();
      if (node) nodes.push(node);
    }
    return nodes;
  }

  private parseInlineDirective(): InlineDirectiveNode {
    const tok = this.advance() as Token & { directiveType: string; expression: string };
    return {
      type: 'InlineDirective',
      directiveType: tok.directiveType,
      expression: tok.expression,
      span: tok.span,
    };
  }
}
