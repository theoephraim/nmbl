import type { SourceSpan } from './source-location.js';

export enum ErrorCode {
  // Lexer errors
  InvalidIndentation = 'INVALID_INDENTATION',
  InconsistentIndentation = 'INCONSISTENT_INDENTATION',
  UnterminatedString = 'UNTERMINATED_STRING',
  UnterminatedTemplateLiteral = 'UNTERMINATED_TEMPLATE_LITERAL',
  UnterminatedAttributes = 'UNTERMINATED_ATTRIBUTES',
  UnterminatedBlockComment = 'UNTERMINATED_BLOCK_COMMENT',
  UnexpectedCharacter = 'UNEXPECTED_CHARACTER',

  // Parser errors
  UnexpectedToken = 'UNEXPECTED_TOKEN',
  VoidElementWithChildren = 'VOID_ELEMENT_WITH_CHILDREN',
  DuplicateId = 'DUPLICATE_ID',
  ExpectedIndent = 'EXPECTED_INDENT',
  ExpectedOutdent = 'EXPECTED_OUTDENT',
}

export interface NmblError {
  code: ErrorCode;
  message: string;
  span: SourceSpan;
}

export function createError(code: ErrorCode, message: string, span: SourceSpan): NmblError {
  return { code, message, span };
}
