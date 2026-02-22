import { type SourcePosition, type SourceSpan, pos, span } from './source-location.js';
import { TokenType, type Token, type AttributeToken } from './tokens.js';
import { ErrorCode, type NmblError, createError } from './errors.js';

enum LexerMode {
  Normal,
  Attributes,
}

export class Lexer {
  private source: string;
  private filename: string;
  private offset = 0;
  private line = 0;
  private column = 0;
  private tokens: Token[] = [];
  private errors: NmblError[] = [];
  private indentStack: number[] = [0];
  private detectedIndent: number | null = null; // spaces per indent level (null = tabs)
  private detectedIndentChar: ' ' | '\t' | null = null;
  private mode: LexerMode = LexerMode.Normal;

  // Track whether we need to emit content-block text lines
  private contentBlockIndent: number | null = null;
  private contentBlockMode: string | null = null;
  private contentBlockEmittedIndent = false;

  constructor(source: string, filename = '<anonymous>') {
    this.source = source;
    this.filename = filename;
  }

  tokenize(): { tokens: Token[]; errors: NmblError[] } {
    while (!this.isAtEnd()) {
      if (this.contentBlockIndent !== null) {
        this.scanContentBlockLine();
      } else {
        this.scanLine();
      }
    }

    // Close content block if still open at EOF
    if (this.contentBlockEmittedIndent) {
      this.emitToken(TokenType.Outdent);
      this.contentBlockEmittedIndent = false;
      this.contentBlockIndent = null;
      this.contentBlockMode = null;
    }

    // Emit outdents for any remaining indent levels
    while (this.indentStack.length > 1) {
      this.indentStack.pop();
      this.emitToken(TokenType.Outdent);
    }

    this.emitToken(TokenType.EOF);
    return { tokens: this.tokens, errors: this.errors };
  }

  // ─── Character Utilities ───────────────────────────────────

  private isAtEnd(): boolean {
    return this.offset >= this.source.length;
  }

  private peek(): string {
    return this.source[this.offset] ?? '\0';
  }

  private peekAt(offset: number): string {
    return this.source[this.offset + offset] ?? '\0';
  }

  private advance(): string {
    const ch = this.source[this.offset] ?? '\0';
    this.offset++;
    if (ch === '\n') {
      this.line++;
      this.column = 0;
    } else {
      this.column++;
    }
    return ch;
  }

  private match(expected: string): boolean {
    if (this.peek() === expected) {
      this.advance();
      return true;
    }
    return false;
  }

  private position(): SourcePosition {
    return pos(this.line, this.column, this.offset);
  }

  private emitToken(type: TokenType.Indent | TokenType.Outdent | TokenType.Newline | TokenType.EOF | TokenType.AttrStart | TokenType.AttrEnd | TokenType.ChildExpansion): void;
  private emitToken<T extends Token>(type: T['type'], extra?: Omit<T, 'type' | 'span'>): void;
  private emitToken(type: TokenType, extra?: Record<string, unknown>): void {
    const p = this.position();
    const s = span(p, p);
    this.tokens.push({ type, span: s, ...extra } as Token);
  }

  private emitTokenSpan(type: TokenType, start: SourcePosition, extra?: Record<string, unknown>): void {
    const s = span(start, this.position());
    this.tokens.push({ type, span: s, ...extra } as Token);
  }

  private addError(code: ErrorCode, message: string, start: SourcePosition, end?: SourcePosition): void {
    this.errors.push(createError(code, message, span(start, end ?? this.position())));
  }

  // ─── Content Block Scanning ────────────────────────────────

  private scanContentBlockLine(): void {
    // Blank line → preserve as empty line in content
    if (this.peek() === '\n') {
      this.advance();
      return;
    }

    // Measure indentation
    const lineIndent = this.measureIndentation();

    // If indentation is <= the parent's indent, the content block is over
    if (lineIndent <= this.contentBlockIndent!) {
      // Emit Outdent if we emitted an Indent
      if (this.contentBlockEmittedIndent) {
        this.emitToken(TokenType.Outdent);
        this.contentBlockEmittedIndent = false;
      }
      // End content block mode
      this.contentBlockIndent = null;
      this.contentBlockMode = null;
      // Don't consume this line — fall through to normal scanning
      this.scanLine();
      return;
    }

    // Emit Indent on first content line
    if (!this.contentBlockEmittedIndent) {
      this.emitToken(TokenType.Indent);
      this.contentBlockEmittedIndent = true;
    }

    // Collect the rest of the line as content text
    const start = this.position();
    // Strip base indentation (contentBlockIndent + one indent level)
    const baseIndent = this.contentBlockIndent! + (this.detectedIndent ?? 1);
    const extraIndent = lineIndent - baseIndent;
    let value = extraIndent > 0 ? ' '.repeat(extraIndent) : '';
    while (!this.isAtEnd() && this.peek() !== '\n') {
      value += this.advance();
    }
    if (!this.isAtEnd()) this.advance(); // consume newline

    this.emitTokenSpan(TokenType.ContentText, start, { value });
  }

  // ─── Line Scanning ────────────────────────────────────────

  private scanLine(): void {
    // Skip blank lines
    if (this.peek() === '\n') {
      this.advance();
      return;
    }

    // Handle \r\n
    if (this.peek() === '\r' && this.peekAt(1) === '\n') {
      this.advance();
      this.advance();
      return;
    }

    // Measure and process indentation
    const lineStart = this.position();
    const indent = this.measureIndentation();

    // Skip blank lines (line was only whitespace)
    if (this.isAtEnd() || this.peek() === '\n') {
      if (this.peek() === '\n') this.advance();
      return;
    }

    this.processIndentation(indent, lineStart);

    // Dispatch based on first char(s)
    if (this.peek() === '/' && this.peekAt(1) === '/') {
      this.scanLineComment();
    } else if (this.peek() === '/' && this.peekAt(1) === '*') {
      this.scanBlockComment();
    } else if (this.peek() === '|') {
      this.scanPipeText();
    } else if (this.peek() === '#' || this.peek() === '.') {
      // Implicit div — starts with # or .
      this.scanElement(true);
    } else if (this.peek() === ':') {
      // Standalone content block (:md, :css, etc.)
      this.scanStandaloneContentMode();
    } else if (this.peek() === '{') {
      const next = this.peekAt(1);
      if (next === '#') {
        this.scanBlockOpen();
      } else if (next === ':') {
        this.scanBlockContinuation();
      } else if (next === '@') {
        this.scanInlineDirective();
      } else {
        const start = this.position();
        this.addError(ErrorCode.UnexpectedCharacter, `Unexpected character '${this.peek()}'`, start);
        this.skipToEndOfLine();
      }
    } else if (this.peek() === '<') {
      // Raw HTML passthrough (e.g. <!DOCTYPE html>)
      this.scanRawHtmlLine();
    } else if (this.isTagStartChar(this.peek())) {
      this.scanElement(false);
    } else {
      // Unexpected character — record error, skip line
      const start = this.position();
      this.addError(ErrorCode.UnexpectedCharacter, `Unexpected character '${this.peek()}'`, start);
      this.skipToEndOfLine();
    }
  }

  // ─── Indentation ──────────────────────────────────────────

  private measureIndentation(): number {
    let indent = 0;
    const startOffset = this.offset;
    while (!this.isAtEnd() && (this.peek() === ' ' || this.peek() === '\t')) {
      const ch = this.peek();
      if (this.detectedIndentChar === null && indent === 0) {
        // First indented char we see — detect type
        if (ch === '\t') {
          this.detectedIndentChar = '\t';
        }
      }
      if (ch === '\t') {
        indent += (this.detectedIndent ?? 2); // tabs count as one indent level
      } else {
        indent++;
      }
      this.advance();
    }

    // Detect indent width on first meaningful indent
    if (this.detectedIndent === null && indent > 0 && this.detectedIndentChar !== '\t') {
      this.detectedIndentChar = ' ';
      this.detectedIndent = indent;
    }

    return indent;
  }

  private processIndentation(indent: number, lineStart: SourcePosition): void {
    const currentIndent = this.indentStack[this.indentStack.length - 1]!;

    if (indent > currentIndent) {
      this.indentStack.push(indent);
      this.emitToken(TokenType.Indent);
    } else if (indent < currentIndent) {
      while (this.indentStack.length > 1 && this.indentStack[this.indentStack.length - 1]! > indent) {
        this.indentStack.pop();
        this.emitToken(TokenType.Outdent);
      }
      // Check for misaligned indentation
      if (this.indentStack[this.indentStack.length - 1] !== indent) {
        this.addError(
          ErrorCode.InvalidIndentation,
          'Indentation does not match any previous level',
          lineStart,
        );
        // Recovery: accept the indent level
        this.indentStack[this.indentStack.length - 1] = indent;
      }
    }
  }

  // ─── Element Scanning ─────────────────────────────────────

  private scanElement(implicitDiv: boolean): void {
    // Tag name (unless implicit div)
    if (!implicitDiv) {
      const start = this.position();
      let name = '';
      while (!this.isAtEnd() && this.isTagChar(this.peek())) {
        name += this.advance();
      }
      this.emitTokenSpan(TokenType.Tag, start, { name });
    }

    // CSS shorthand: #id and .class chains
    this.scanCssShorthand();

    // Attributes in parens
    if (this.peek() === '(') {
      this.scanAttributes();
    }

    // After tag+shorthand+attrs, check what follows
    this.scanAfterTag();
  }

  private scanCssShorthand(): void {
    while (!this.isAtEnd() && (this.peek() === '#' || this.peek() === '.')) {
      const type = this.peek() === '#' ? TokenType.Id : TokenType.Class;
      this.advance(); // skip # or .
      const start = this.position();
      let name = '';
      while (!this.isAtEnd() && this.isCssNameChar(this.peek())) {
        name += this.advance();
      }
      if (name) {
        this.emitTokenSpan(type, start, { name });
      }
    }
  }

  private scanAfterTag(): void {
    // Content mode suffix: `tag:filter` (no space before or after colon, or colon at end of tag)
    if (this.peek() === ':') {
      // Content mode: `tag:filter` or `tag:` (default text)
      this.advance(); // consume ':'
      const start = this.position();
      let modeName = '';
      while (!this.isAtEnd() && this.isTagChar(this.peek())) {
        modeName += this.advance();
      }
      if (!modeName) modeName = 'text';
      this.emitTokenSpan(TokenType.ContentMode, start, { name: modeName });

      // Skip rest of line
      this.skipToEndOfLine();

      // Set up content block scanning
      this.contentBlockIndent = this.indentStack[this.indentStack.length - 1]!;
      this.contentBlockMode = modeName;
      return;
    }

    // Block expansion: `tag > child`
    if (this.peek() === ' ' && this.peekAt(1) === '>' && this.peekAt(2) === ' ') {
      this.advance(); // consume ' '
      this.advance(); // consume '>'
      this.advance(); // consume ' '
      this.emitToken(TokenType.ChildExpansion);
      // Parse the inline child element
      if (this.peek() === '#' || this.peek() === '.') {
        this.scanElement(true);
      } else if (this.isTagStartChar(this.peek())) {
        this.scanElement(false);
      }
      return;
    }

    // Inline text: rest of line after a space
    if (this.peek() === ' ') {
      this.advance(); // consume space
      this.scanInlineText();
      return;
    }

    // End of line — element has no inline content, may have indented children
    this.consumeNewline();
  }

  private scanStandaloneContentMode(): void {
    this.advance(); // consume ':'
    const start = this.position();
    let modeName = '';
    while (!this.isAtEnd() && this.isTagChar(this.peek())) {
      modeName += this.advance();
    }
    if (!modeName) modeName = 'text';
    this.emitTokenSpan(TokenType.ContentMode, start, { name: modeName });

    // Skip rest of line
    this.skipToEndOfLine();

    // Set up content block scanning
    this.contentBlockIndent = this.indentStack[this.indentStack.length - 1]!;
    this.contentBlockMode = modeName;
  }

  // ─── Attribute Scanning ───────────────────────────────────

  private scanAttributes(): void {
    const start = this.position();
    this.advance(); // consume '('
    this.emitTokenSpan(TokenType.AttrStart, start);
    this.mode = LexerMode.Attributes;

    while (!this.isAtEnd() && this.peek() !== ')') {
      this.skipAttrWhitespace();

      if (this.isAtEnd() || this.peek() === ')') break;

      // Comment inside attrs
      if (this.peek() === '/' && this.peekAt(1) === '/') {
        this.skipAttrLineComment();
        continue;
      }
      if (this.peek() === '/' && this.peekAt(1) === '*') {
        this.skipAttrBlockComment();
        continue;
      }

      this.scanAttribute();
    }

    if (this.peek() === ')') {
      const end = this.position();
      this.advance();
      this.emitTokenSpan(TokenType.AttrEnd, end);
    } else {
      // Unterminated attributes
      this.addError(ErrorCode.UnterminatedAttributes, 'Unterminated attribute list', start);
      this.emitToken(TokenType.AttrEnd);
    }

    this.mode = LexerMode.Normal;
  }

  private scanAttribute(): void {
    const start = this.position();
    let bound = false;

    // Check for bound prefix
    if (this.peek() === ':') {
      bound = true;
      this.advance();
    }

    // Check for v-directive or other special chars
    let name = '';
    while (!this.isAtEnd() && this.isAttrNameChar(this.peek())) {
      name += this.advance();
    }

    if (!name) {
      // Recovery: skip unexpected character
      const errStart = this.position();
      this.addError(ErrorCode.UnexpectedCharacter, `Unexpected character '${this.peek()}' in attribute list`, errStart);
      this.advance();
      return;
    }

    // Check for value
    let value: string | null = null;
    let templateLiteral = false;
    let expression = false;

    this.skipAttrWhitespace();

    if (this.peek() === '=') {
      this.advance(); // consume '='
      this.skipAttrWhitespace();

      if (this.peek() === '"') {
        value = this.scanDoubleQuotedString();
      } else if (this.peek() === "'") {
        value = this.scanSingleQuotedString();
      } else if (this.peek() === '`') {
        value = this.scanTemplateLiteral();
        templateLiteral = true;
      } else if (this.peek() === '{') {
        value = this.scanExpressionValue();
        expression = true;
      } else {
        // Bare value — scan until whitespace or )
        let v = '';
        while (!this.isAtEnd() && this.peek() !== ')' && this.peek() !== ' ' && this.peek() !== '\n' && this.peek() !== '\r' && this.peek() !== '\t') {
          v += this.advance();
        }
        value = v;
      }
    } else if (bound && value === null) {
      // Bound shorthand: `:firstName` → `:firstName="firstName"`
      value = name;
    }

    this.emitTokenSpan(TokenType.Attribute, start, { name, value, bound, templateLiteral, expression } satisfies Omit<AttributeToken, 'type' | 'span'>);
  }

  private scanDoubleQuotedString(): string {
    const start = this.position();
    this.advance(); // consume opening "
    let value = '';
    while (!this.isAtEnd() && this.peek() !== '"') {
      if (this.peek() === '\\') {
        this.advance(); // skip backslash
        if (!this.isAtEnd()) value += this.advance();
      } else {
        value += this.advance();
      }
    }
    if (this.peek() === '"') {
      this.advance();
    } else {
      this.addError(ErrorCode.UnterminatedString, 'Unterminated double-quoted string', start);
    }
    return value;
  }

  private scanSingleQuotedString(): string {
    const start = this.position();
    this.advance(); // consume opening '
    let value = '';
    while (!this.isAtEnd() && this.peek() !== "'") {
      // Single-quoted strings can span lines (JSON-like values)
      value += this.advance();
    }
    if (this.peek() === "'") {
      this.advance();
    } else {
      this.addError(ErrorCode.UnterminatedString, 'Unterminated single-quoted string', start);
    }
    return value;
  }

  private scanTemplateLiteral(): string {
    const start = this.position();
    this.advance(); // consume opening `
    let value = '';
    let braceDepth = 0;

    while (!this.isAtEnd()) {
      if (this.peek() === '`' && braceDepth === 0) {
        this.advance();
        return value;
      }
      if (this.peek() === '$' && this.peekAt(1) === '{') {
        value += this.advance(); // $
        value += this.advance(); // {
        braceDepth++;
      } else if (this.peek() === '}' && braceDepth > 0) {
        value += this.advance();
        braceDepth--;
      } else if (this.peek() === '\\') {
        value += this.advance(); // backslash
        if (!this.isAtEnd()) value += this.advance();
      } else {
        value += this.advance();
      }
    }

    this.addError(ErrorCode.UnterminatedTemplateLiteral, 'Unterminated template literal', start);
    return value;
  }

  private scanExpressionValue(): string {
    const start = this.position();
    let value = '';
    let depth = 0;
    while (!this.isAtEnd()) {
      const ch = this.peek();
      if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          value += this.advance(); // consume final }
          return value;
        }
      } else if (ch === '"' || ch === "'" || ch === '`') {
        // Skip string contents to avoid counting braces inside strings
        value += this.advance(); // opening quote
        const quote = ch;
        while (!this.isAtEnd() && this.peek() !== quote) {
          if (this.peek() === '\\') value += this.advance(); // escape
          value += this.advance();
        }
        if (!this.isAtEnd()) value += this.advance(); // closing quote
        continue;
      }
      value += this.advance();
    }
    this.addError(ErrorCode.UnterminatedExpression, 'Unterminated expression', start);
    return value;
  }

  private skipAttrWhitespace(): void {
    while (!this.isAtEnd() && (this.peek() === ' ' || this.peek() === '\t' || this.peek() === '\n' || this.peek() === '\r')) {
      this.advance();
    }
  }

  private skipAttrLineComment(): void {
    this.advance(); // /
    this.advance(); // /
    while (!this.isAtEnd() && this.peek() !== '\n') {
      this.advance();
    }
  }

  private skipAttrBlockComment(): void {
    const start = this.position();
    this.advance(); // /
    this.advance(); // *
    while (!this.isAtEnd()) {
      if (this.peek() === '*' && this.peekAt(1) === '/') {
        this.advance();
        this.advance();
        return;
      }
      this.advance();
    }
    this.addError(ErrorCode.UnterminatedBlockComment, 'Unterminated block comment in attributes', start);
  }

  // ─── Raw HTML Passthrough ─────────────────────────────────

  private scanRawHtmlLine(): void {
    const start = this.position();
    let value = '';
    while (!this.isAtEnd() && this.peek() !== '\n') {
      value += this.advance();
    }
    this.emitTokenSpan(TokenType.Text, start, { value, preserveTrailingWhitespace: false });
    this.consumeNewline();
  }

  // ─── Text Scanning ────────────────────────────────────────

  private scanInlineText(): void {
    const start = this.position();
    let value = '';
    let preserveTrailing = false;

    while (!this.isAtEnd() && this.peek() !== '\n') {
      value += this.advance();
    }

    // Check for trailing backslash
    if (value.endsWith('\\')) {
      value = value.slice(0, -1);
      preserveTrailing = true;
    }

    this.emitTokenSpan(TokenType.Text, start, { value, preserveTrailingWhitespace: preserveTrailing });
    this.consumeNewline();
  }

  private scanPipeText(): void {
    this.advance(); // consume '|'
    if (this.peek() === ' ') this.advance(); // consume optional space after |

    const start = this.position();
    let value = '';
    let preserveTrailing = false;

    while (!this.isAtEnd() && this.peek() !== '\n') {
      value += this.advance();
    }

    // Check for trailing backslash
    if (value.endsWith('\\')) {
      value = value.slice(0, -1);
      preserveTrailing = true;
    }

    this.emitTokenSpan(TokenType.PipeText, start, { value, preserveTrailingWhitespace: preserveTrailing });
    this.consumeNewline();
  }

  // ─── Comment Scanning ─────────────────────────────────────

  private scanLineComment(): void {
    const start = this.position();
    this.advance(); // /
    this.advance(); // /

    let isHtml = false;
    if (this.peek() === '!') {
      isHtml = true;
      this.advance(); // !
    }

    // Optional space after // or //!
    if (this.peek() === ' ') this.advance();

    let value = '';
    while (!this.isAtEnd() && this.peek() !== '\n') {
      value += this.advance();
    }
    this.consumeNewline();

    // Collect indented continuation lines
    const commentIndent = this.indentStack[this.indentStack.length - 1]!;
    value += this.collectIndentedCommentLines(commentIndent);

    const type = isHtml ? TokenType.HtmlComment : TokenType.Comment;
    this.emitTokenSpan(type, start, { value });
  }

  private scanBlockComment(): void {
    const start = this.position();
    this.advance(); // /
    this.advance(); // *

    let isHtml = false;
    if (this.peek() === '!') {
      isHtml = true;
      this.advance(); // !
    }

    // Optional space
    if (this.peek() === ' ') this.advance();

    let value = '';
    while (!this.isAtEnd()) {
      if (this.peek() === '*' && this.peekAt(1) === '/') {
        this.advance();
        this.advance();

        const type = isHtml ? TokenType.BlockHtmlComment : TokenType.BlockComment;
        this.emitTokenSpan(type, start, { value });
        this.skipToEndOfLine();
        return;
      }
      value += this.advance();
    }

    this.addError(ErrorCode.UnterminatedBlockComment, 'Unterminated block comment', start);
    const type = isHtml ? TokenType.BlockHtmlComment : TokenType.BlockComment;
    this.emitTokenSpan(type, start, { value });
  }

  private collectIndentedCommentLines(parentIndent: number): string {
    let result = '';
    while (!this.isAtEnd()) {
      // Save position before consuming any blank lines
      const savedOffset = this.offset;
      const savedLine = this.line;
      const savedColumn = this.column;

      // Tentatively consume blank lines
      let blanks = '';
      while (!this.isAtEnd() && this.peek() === '\n') {
        this.advance();
        blanks += '\n';
      }

      if (this.isAtEnd()) {
        // Trailing blank lines — don't include in comment, restore
        this.offset = savedOffset;
        this.line = savedLine;
        this.column = savedColumn;
        break;
      }

      const lineIndent = this.measureIndentation();

      if (lineIndent <= parentIndent || this.isAtEnd() || this.peek() === '\n') {
        // Not a continuation — restore position to before blank lines
        this.offset = savedOffset;
        this.line = savedLine;
        this.column = savedColumn;
        break;
      }

      // It's a continuation line — keep the blank lines and collect it
      result += blanks + '\n';
      while (!this.isAtEnd() && this.peek() !== '\n') {
        result += this.advance();
      }
      if (!this.isAtEnd() && this.peek() === '\n') {
        this.advance();
      }
    }
    return result;
  }

  // ─── Control Flow Block Scanning ─────────────────────────

  private scanBlockOpen(): void {
    const start = this.position();
    this.advance(); // consume '{'
    this.advance(); // consume '#'

    // Read block type word
    let blockType = '';
    while (!this.isAtEnd() && this.isTagChar(this.peek())) {
      blockType += this.advance();
    }

    // Read expression (rest until closing '}')
    let expression = '';
    if (this.peek() === ' ') this.advance(); // skip space after block type
    while (!this.isAtEnd() && this.peek() !== '}') {
      expression += this.advance();
    }
    if (this.peek() === '}') {
      this.advance(); // consume '}'
    } else {
      this.addError(ErrorCode.UnterminatedExpression, 'Unterminated block open', start);
    }

    this.emitTokenSpan(TokenType.BlockOpen, start, { blockType, expression: expression.trim() });
    this.consumeNewline();
  }

  private scanBlockContinuation(): void {
    const start = this.position();
    this.advance(); // consume '{'
    this.advance(); // consume ':'

    // Read clause type word
    let clauseType = '';
    while (!this.isAtEnd() && this.isTagChar(this.peek())) {
      clauseType += this.advance();
    }

    // Handle {:else if ...} as a special case
    if (clauseType === 'else' && this.peek() === ' ' && this.peekAt(1) === 'i' && this.peekAt(2) === 'f') {
      // Check if it's actually "else if"
      const savedOffset = this.offset;
      const savedLine = this.line;
      const savedColumn = this.column;
      this.advance(); // consume space
      let nextWord = '';
      while (!this.isAtEnd() && this.isTagChar(this.peek())) {
        nextWord += this.advance();
      }
      if (nextWord === 'if') {
        clauseType = 'else if';
      } else {
        // Restore — it wasn't "else if"
        this.offset = savedOffset;
        this.line = savedLine;
        this.column = savedColumn;
      }
    }

    // Read expression (rest until closing '}')
    let expression = '';
    if (this.peek() === ' ') this.advance(); // skip space
    while (!this.isAtEnd() && this.peek() !== '}') {
      expression += this.advance();
    }
    if (this.peek() === '}') {
      this.advance(); // consume '}'
    } else {
      this.addError(ErrorCode.UnterminatedExpression, 'Unterminated block continuation', start);
    }

    this.emitTokenSpan(TokenType.BlockContinuation, start, { clauseType, expression: expression.trim() });
    this.consumeNewline();
  }

  private scanInlineDirective(): void {
    const start = this.position();
    this.advance(); // consume '{'
    this.advance(); // consume '@'

    // Read directive type word
    let directiveType = '';
    while (!this.isAtEnd() && this.isTagChar(this.peek())) {
      directiveType += this.advance();
    }

    // Read expression (rest until closing '}')
    let expression = '';
    if (this.peek() === ' ') this.advance(); // skip space
    while (!this.isAtEnd() && this.peek() !== '}') {
      expression += this.advance();
    }
    if (this.peek() === '}') {
      this.advance(); // consume '}'
    } else {
      this.addError(ErrorCode.UnterminatedExpression, 'Unterminated inline directive', start);
    }

    this.emitTokenSpan(TokenType.InlineDirective, start, { directiveType, expression: expression.trim() });
    this.consumeNewline();
  }

  // ─── Helpers ──────────────────────────────────────────────

  private isTagStartChar(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
  }

  private isTagChar(ch: string): boolean {
    return this.isTagStartChar(ch) || (ch >= '0' && ch <= '9') || ch === '-';
  }

  private isCssNameChar(ch: string): boolean {
    return this.isTagChar(ch);
  }

  private isAttrNameChar(ch: string): boolean {
    return this.isTagChar(ch) || ch === '@' || ch === 'v' || ch === '.' || ch === ':' || ch === '#';
    // Note: v-directive handled by isTagChar, @ for Vue event shorthand, : for directive attrs like client:load, # for Vue slot shorthand
  }

  private skipToEndOfLine(): void {
    while (!this.isAtEnd() && this.peek() !== '\n') {
      this.advance();
    }
    this.consumeNewline();
  }

  private consumeNewline(): void {
    if (!this.isAtEnd() && this.peek() === '\r') this.advance();
    if (!this.isAtEnd() && this.peek() === '\n') this.advance();
  }
}
