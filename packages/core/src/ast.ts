import type { SourceSpan } from './source-location.js';

export interface DocumentNode {
  type: 'Document';
  children: AstNode[];
  span: SourceSpan;
}

export interface ElementNode {
  type: 'Element';
  tagName: string;
  isComponent: boolean;
  isVoid: boolean;
  isImplicitDiv: boolean;
  isBlockExpansion: boolean;
  id: string | null;
  idSpan?: SourceSpan;  // Source span for CSS shorthand ID
  classes: string[];
  classSpans?: SourceSpan[];  // Source spans for CSS shorthand classes
  attributes: AttributeNode[];
  children: AstNode[];
  contentMode: string | null;
  span: SourceSpan;
}

export interface AttributeNode {
  type: 'Attribute';
  name: string;
  value: string | null;
  bound: boolean;
  templateLiteral: boolean;
  expression: boolean;
  span: SourceSpan;
}

export interface TextNode {
  type: 'Text';
  value: string;
  preserveTrailingWhitespace: boolean;
  span: SourceSpan;
}

export interface HtmlCommentNode {
  type: 'HtmlComment';
  value: string;
  isBlock: boolean;
  span: SourceSpan;
}

export interface ContentBlockNode {
  type: 'ContentBlock';
  mode: string;
  body: string;
  span: SourceSpan;
}

/**
 * Structured iteration info parsed from an @each expression. Both input forms
 * normalize here: `item, i of items` (JS/Vue-style) and
 * `items as item, i (item.id)` (Svelte-style). Compilers emit each host's
 * native syntax from this regardless of which form was written.
 */
export interface EachExpr {
  collection: string;
  /** 1–3 binding slices (item / item,index / Vue's value,key,index). */
  bindings: string[];
  /** Key expression — from Svelte-style trailing `(expr)` or a `:key` attr. */
  key?: string;
}

export interface BlockNode {
  type: 'Block';
  blockType: string;
  expression: string;
  /** Parsed iteration structure (each blocks; undefined when unparseable). */
  each?: EachExpr;
  /**
   * Wrapper attributes following the expression in the same parens —
   * `@each(item of items :key="item.id")`. `:key` is extracted into
   * `each.key`; the rest are used by hosts whose blocks compile to a wrapper
   * element (Vue's `<template v-for>`).
   */
  attributes?: AttributeNode[];
  clauses: BlockClauseNode[];
  span: SourceSpan;
}

export interface BlockClauseNode {
  type: 'BlockClause';
  clauseType: string | null;
  expression: string;
  children: AstNode[];
  span: SourceSpan;
}

export interface InlineDirectiveNode {
  type: 'InlineDirective';
  directiveType: string;
  expression: string;
  span: SourceSpan;
}

export type AstNode =
  | ElementNode
  | TextNode
  | HtmlCommentNode
  | ContentBlockNode
  | BlockNode
  | InlineDirectiveNode;
