export { Lexer } from './lexer.js';
export { Parser } from './parser.js';
export { Compiler, type CompilerOptions } from './compiler.js';
export { decompile, type DecompileOptions } from './decompiler.js';
export { TokenType, type Token } from './tokens.js';
export type { SourcePosition, SourceSpan } from './source-location.js';
export type {
  DocumentNode, ElementNode, AttributeNode, TextNode,
  CommentNode, HtmlCommentNode, ContentBlockNode, AstNode,
} from './ast.js';
export { ErrorCode, type NmblError } from './errors.js';
export { VOID_ELEMENTS, INLINE_ELEMENTS } from './constants.js';

import { Lexer } from './lexer.js';
import { Parser } from './parser.js';
import { Compiler, type CompilerOptions } from './compiler.js';
import type { Token } from './tokens.js';
import type { DocumentNode } from './ast.js';
import type { NmblError } from './errors.js';

/** Tokenize source into a token stream. */
export function tokenize(source: string, filename?: string): { tokens: Token[]; errors: NmblError[] } {
  const lexer = new Lexer(source, filename);
  return lexer.tokenize();
}

/** Parse source into an AST. */
export function parse(source: string, filename?: string): { ast: DocumentNode; errors: NmblError[] } {
  const { tokens, errors: lexErrors } = tokenize(source, filename);
  const parser = new Parser(tokens);
  const { ast, errors: parseErrors } = parser.parse();
  return { ast, errors: [...lexErrors, ...parseErrors] };
}

/** Compile a pre-parsed AST to HTML. */
export function compileAst(ast: DocumentNode, options?: CompilerOptions): string {
  const compiler = new Compiler(options);
  return compiler.compile(ast);
}

/** Full pipeline: source → HTML. */
export function compile(source: string, options?: CompilerOptions & { filename?: string }): { html: string; errors: NmblError[] } {
  const { ast, errors } = parse(source, options?.filename);
  const html = compileAst(ast, options);
  return { html, errors };
}
