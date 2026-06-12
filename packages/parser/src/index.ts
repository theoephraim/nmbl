export { Compiler, type CompilerOptions, type SourceMapping, type CompileResult } from './compiler.js';
export { decompile, type DecompileOptions } from './decompiler.js';
export type { SourcePosition, SourceSpan } from './source-location.js';
export type {
  DocumentNode, ElementNode, AttributeNode, TextNode,
  HtmlCommentNode, ContentBlockNode, AstNode,
  BlockNode, BlockClauseNode, InlineDirectiveNode, EachExpr,
} from './ast.js';
export { ErrorCode, type NmblError } from './errors.js';
export { VOID_ELEMENTS, INLINE_ELEMENTS } from './constants.js';
export { parseToAst, tokenizeSource, type ParseToAstResult, type NmblToken } from './cst-to-ast.js';
export { recoverComments, type RecoveredComment } from './comments.js';
export { default as nmblGrammar, type NmblGrammar } from './nmbl-grammar.js';

import { Compiler, type CompilerOptions, type CompileResult } from './compiler.js';
import { parseToAst, tokenizeSource } from './cst-to-ast.js';
import type { DocumentNode } from './ast.js';
import type { NmblError } from './errors.js';

/**
 * Tokenize source into monogram's token stream.
 * (The token shape changed in the monogram rewrite — tokens carry
 * `type`/`text`/`offset`; structural Indent/Dedent/Newline are tokens.)
 */
export function tokenize(source: string, _filename?: string) {
  return tokenizeSource(source);
}

/** Parse source into the compiler AST. */
export function parse(source: string, _filename?: string): { ast: DocumentNode; errors: NmblError[] } {
  const { ast, errors } = parseToAst(source);
  return { ast, errors };
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
  result.errors = [...errors, ...result.errors];
  return result;
}

/** Backward compatibility: compile to HTML string only. */
export function compileToHtml(source: string, options?: CompilerOptions & { filename?: string }): { html: string; errors: NmblError[] } {
  const result = compile(source, options);
  return { html: result.html, errors: result.errors };
}
