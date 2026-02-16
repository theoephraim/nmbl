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
  classes: string[];
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
  span: SourceSpan;
}

export interface TextNode {
  type: 'Text';
  value: string;
  preserveTrailingWhitespace: boolean;
  span: SourceSpan;
}

export interface CommentNode {
  type: 'Comment';
  value: string;
  isBlock: boolean;
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

export type AstNode =
  | ElementNode
  | TextNode
  | CommentNode
  | HtmlCommentNode
  | ContentBlockNode;
