export { Lexer } from './lexer.js';
export { Parser } from './parser.js';
export { Compiler, type CompilerOptions, type SourceMapping, type CompileResult } from './compiler.js';
export { decompile, type DecompileOptions } from './decompiler.js';
export { TokenType, type Token } from './tokens.js';
export type { SourcePosition, SourceSpan } from './source-location.js';
export type {
  DocumentNode, ElementNode, AttributeNode, TextNode,
  CommentNode, HtmlCommentNode, ContentBlockNode, AstNode,
  BlockNode, BlockClauseNode, InlineDirectiveNode,
} from './ast.js';
export { ErrorCode, type NmblError } from './errors.js';
export { VOID_ELEMENTS, INLINE_ELEMENTS } from './constants.js';

import { Lexer } from './lexer.js';
import { Parser } from './parser.js';
import { Compiler, type CompilerOptions, type CompileResult } from './compiler.js';
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

/** Compile a pre-parsed AST to HTML with source mappings. */
export function compileAst(ast: DocumentNode, options?: CompilerOptions & { source?: string }): CompileResult {
  const compiler = new Compiler(options);
  return compiler.compileWithMappings(ast, options?.source);
}

/** Full pipeline: source → HTML with source mappings. */
export function compile(source: string, options?: CompilerOptions & { filename?: string }): CompileResult {
  const { ast, errors } = parse(source, options?.filename);
  const result = compileAst(ast, { ...options, source });
  // Merge parse errors with compile errors
  result.errors = [...errors, ...result.errors];
  return result;
}

/** Backward compatibility: compile to HTML string only. */
export function compileToHtml(source: string, options?: CompilerOptions & { filename?: string }): { html: string; errors: NmblError[] } {
  const result = compile(source, options);
  return { html: result.html, errors: result.errors };
}
