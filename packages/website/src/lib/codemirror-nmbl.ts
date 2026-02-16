import { StreamLanguage, type StringStream } from '@codemirror/language';

interface NmblState {
  inAttributes: boolean;
  inBlockComment: boolean;
  lineStart: boolean;
}

function tokenize(stream: StringStream, state: NmblState): string | null {
  // Block comment continuation
  if (state.inBlockComment) {
    const end = stream.match(/.*?\*\//) as RegExpMatchArray | null;
    if (end) {
      state.inBlockComment = false;
    } else {
      stream.skipToEnd();
    }
    return 'comment';
  }

  // Inside attribute parens
  if (state.inAttributes) {
    // Closing paren
    if (stream.eat(')')) {
      state.inAttributes = false;
      return 'punctuation';
    }

    // Comments inside attributes
    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.match('/*')) {
      if (stream.match(/.*?\*\//)) {
        return 'comment';
      }
      state.inBlockComment = true;
      stream.skipToEnd();
      return 'comment';
    }

    // Bound attribute :name or @event
    if (stream.match(/[:@][a-zA-Z_][a-zA-Z0-9_-]*/)) {
      return 'keyword';
    }

    // Vue directive v-name
    if (stream.match(/v-[a-zA-Z0-9_-]+(?::[a-zA-Z0-9_-]+)?/)) {
      return 'keyword';
    }

    // Attribute name
    if (stream.match(/[a-zA-Z_][a-zA-Z0-9_-]*/)) {
      return 'attributeName';
    }

    // = sign
    if (stream.eat('=')) {
      return 'punctuation';
    }

    // String values
    if (stream.match(/"[^"]*"/)) {
      return 'string';
    }
    if (stream.match(/'[^']*'/)) {
      return 'string';
    }
    if (stream.eat('`')) {
      // Template literal - consume until closing backtick
      while (!stream.eol()) {
        if (stream.eat('`')) return 'string';
        if (stream.match('${')) {
          // Skip interpolation content
          let depth = 1;
          while (!stream.eol() && depth > 0) {
            if (stream.eat('{')) depth++;
            else if (stream.eat('}')) depth--;
            else stream.next();
          }
        } else {
          stream.next();
        }
      }
      return 'string';
    }

    // Whitespace
    if (stream.eatSpace()) {
      return null;
    }

    stream.next();
    return null;
  }

  // Start of line processing
  if (state.lineStart) {
    state.lineStart = false;

    // Skip leading whitespace
    stream.eatSpace();

    if (stream.eol()) return null;

    // Comments: //! or //
    if (stream.match('//!') || stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }

    // Block comments
    if (stream.match('/*!') || stream.match('/*')) {
      if (stream.match(/.*?\*\//)) {
        return 'comment';
      }
      state.inBlockComment = true;
      stream.skipToEnd();
      return 'comment';
    }

    // Pipe text
    if (stream.eat('|')) {
      stream.skipToEnd();
      return 'string';
    }

    // Component name (PascalCase)
    if (stream.match(/[A-Z][a-zA-Z0-9_-]*/)) {
      return 'tagName';
    }

    // Tag name (lowercase)
    if (stream.match(/[a-z_][a-zA-Z0-9_-]*/)) {
      return 'tagName';
    }

    // Implicit div with #id or .class
    if (stream.peek() === '#' || stream.peek() === '.') {
      // Don't consume, let the normal flow handle CSS shorthand
    }
  }

  // CSS shorthand: #id
  if (stream.eat('#')) {
    stream.match(/[a-zA-Z0-9_-]+/);
    return 'className'; // CodeMirror uses className for CSS identifiers
  }

  // CSS shorthand: .class
  if (stream.eat('.')) {
    stream.match(/[a-zA-Z0-9_-]+/);
    return 'className';
  }

  // Content mode :modeName (after tag, not inside attrs)
  if (stream.eat(':')) {
    if (stream.match(/[a-zA-Z][a-zA-Z0-9]*/)) {
      return 'keyword';
    }
    // Block expansion `: ` (colon followed by space)
    if (stream.peek() === ' ') {
      return 'keyword';
    }
    return 'punctuation';
  }

  // Opening paren starts attributes
  if (stream.eat('(')) {
    state.inAttributes = true;
    return 'punctuation';
  }

  // Block comment outside element line
  if (stream.match('/*')) {
    if (stream.match(/.*?\*\//)) {
      return 'comment';
    }
    state.inBlockComment = true;
    stream.skipToEnd();
    return 'comment';
  }

  // Inline text (anything else after tag/attrs)
  if (stream.match(/`[^`]*`/)) {
    return 'string';
  }

  // Skip rest as plain text
  stream.next();
  return 'string2'; // string2 maps to a muted text color in most themes
}

const nmblStreamParser = {
  startState(): NmblState {
    return {
      inAttributes: false,
      inBlockComment: false,
      lineStart: true,
    };
  },
  token(stream: StringStream, state: NmblState): string | null {
    if (stream.sol()) {
      state.lineStart = true;
    }
    return tokenize(stream, state);
  },
};

export const nmblLanguage = StreamLanguage.define(nmblStreamParser);
