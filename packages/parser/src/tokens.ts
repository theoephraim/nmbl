import type { SourceSpan } from './source-location.js';

export enum TokenType {
  // Structural
  Indent = 'Indent',
  Outdent = 'Outdent',
  Newline = 'Newline',
  EOF = 'EOF',

  // Elements
  Tag = 'Tag',
  Id = 'Id',
  Class = 'Class',

  // Attributes
  AttrStart = 'AttrStart',
  AttrEnd = 'AttrEnd',
  Attribute = 'Attribute',

  // Text
  Text = 'Text',
  PipeText = 'PipeText',

  // Comments
  Comment = 'Comment',
  HtmlComment = 'HtmlComment',
  BlockComment = 'BlockComment',
  BlockHtmlComment = 'BlockHtmlComment',

  // Content mode
  ContentMode = 'ContentMode',
  ContentText = 'ContentText',

  // Block expansion
  ChildExpansion = 'ChildExpansion',

  // Control flow blocks (Svelte-style)
  BlockOpen = 'BlockOpen',
  BlockContinuation = 'BlockContinuation',
  InlineDirective = 'InlineDirective',
}

interface BaseToken {
  type: TokenType;
  span: SourceSpan;
}

export interface IndentToken extends BaseToken { type: TokenType.Indent }
export interface OutdentToken extends BaseToken { type: TokenType.Outdent }
export interface NewlineToken extends BaseToken { type: TokenType.Newline }
export interface EOFToken extends BaseToken { type: TokenType.EOF }

export interface TagToken extends BaseToken {
  type: TokenType.Tag;
  name: string;
}

export interface IdToken extends BaseToken {
  type: TokenType.Id;
  name: string;
}

export interface ClassToken extends BaseToken {
  type: TokenType.Class;
  name: string;
}

export interface AttrStartToken extends BaseToken { type: TokenType.AttrStart }
export interface AttrEndToken extends BaseToken { type: TokenType.AttrEnd }

export interface AttributeToken extends BaseToken {
  type: TokenType.Attribute;
  name: string;
  value: string | null;
  bound: boolean;
  templateLiteral: boolean;
  expression: boolean;
}

export interface TextToken extends BaseToken {
  type: TokenType.Text;
  value: string;
  preserveTrailingWhitespace: boolean;
}

export interface PipeTextToken extends BaseToken {
  type: TokenType.PipeText;
  value: string;
  preserveTrailingWhitespace: boolean;
}

export interface CommentToken extends BaseToken {
  type: TokenType.Comment;
  value: string;
}

export interface HtmlCommentToken extends BaseToken {
  type: TokenType.HtmlComment;
  value: string;
}

export interface BlockCommentToken extends BaseToken {
  type: TokenType.BlockComment;
  value: string;
}

export interface BlockHtmlCommentToken extends BaseToken {
  type: TokenType.BlockHtmlComment;
  value: string;
}

export interface ContentModeToken extends BaseToken {
  type: TokenType.ContentMode;
  name: string;
}

export interface ContentTextToken extends BaseToken {
  type: TokenType.ContentText;
  value: string;
}

export interface ChildExpansionToken extends BaseToken { type: TokenType.ChildExpansion }

export interface BlockOpenToken extends BaseToken {
  type: TokenType.BlockOpen;
  blockType: string;
  expression: string;
}

export interface BlockContinuationToken extends BaseToken {
  type: TokenType.BlockContinuation;
  clauseType: string;
  expression: string;
}

export interface InlineDirectiveToken extends BaseToken {
  type: TokenType.InlineDirective;
  directiveType: string;
  expression: string;
}

export type Token =
  | IndentToken | OutdentToken | NewlineToken | EOFToken
  | TagToken | IdToken | ClassToken
  | AttrStartToken | AttrEndToken | AttributeToken
  | TextToken | PipeTextToken
  | CommentToken | HtmlCommentToken | BlockCommentToken | BlockHtmlCommentToken
  | ContentModeToken | ContentTextToken
  | ChildExpansionToken
  | BlockOpenToken | BlockContinuationToken | InlineDirectiveToken;
