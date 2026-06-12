// linter.ts — best-practice and correctness diagnostics for NMBL.
//
// The formatter already canonicalizes *style* (indentation, quotes, selector
// order, redundant `div`), so the linter deliberately avoids re-checking
// things a format pass silently fixes. It focuses on what a formatter should
// NOT change on its own — duplicate attributes, dead/duplicate classes,
// suspicious casing — plus surfacing the parser's own diagnostics. Inspired by
// pug-lint, adapted to a framework-agnostic shorthand.
import { parseToAst } from './cst-to-ast.js';
import type { DocumentNode, ElementNode, AstNode, BlockNode } from './ast.js';
import type { SourceSpan } from './source-location.js';

export type LintSeverity = 'error' | 'warning';
export type RuleSetting = LintSeverity | 'off';

export interface LintMessage {
  ruleId: string;
  severity: LintSeverity;
  message: string;
  span: SourceSpan;
  /** True when `nmbl format` would resolve this on its own. */
  fixable: boolean;
}

export interface LintOptions {
  /** Override individual rule severities (or turn them `off`). */
  rules?: Record<string, RuleSetting>;
}

/** Built-in rules and their default severity. */
export const DEFAULT_RULES: Record<string, LintSeverity> = {
  'no-duplicate-attributes': 'error',
  'no-duplicate-classes': 'warning',
  'prefer-div-shorthand': 'warning',
  'no-empty-class-or-id': 'warning',
  'component-pascal-case': 'warning',
};

interface RuleContext {
  setting: (ruleId: string) => RuleSetting;
  report: (ruleId: string, message: string, span: SourceSpan, fixable?: boolean) => void;
}

type ElementRule = (node: ElementNode, ctx: RuleContext) => void;

const ELEMENT_RULES: Record<string, ElementRule> = {
  'no-duplicate-attributes': (node, ctx) => {
    const seen = new Map<string, boolean>();
    for (const attr of node.attributes) {
      const key = (attr.bound ? ':' : '') + attr.name;
      if (seen.has(key)) {
        ctx.report('no-duplicate-attributes', `Duplicate attribute '${key}'`, attr.span, false);
      }
      seen.set(key, true);
    }
  },

  'no-duplicate-classes': (node, ctx) => {
    const seen = new Set<string>();
    node.classes.forEach((cls, i) => {
      if (seen.has(cls)) {
        ctx.report('no-duplicate-classes', `Duplicate class '.${cls}'`, node.classSpans?.[i] ?? node.span, true);
      }
      seen.add(cls);
    });
  },

  'prefer-div-shorthand': (node, ctx) => {
    if (node.tagName === 'div' && !node.isImplicitDiv && (node.id !== null || node.classes.length > 0)) {
      ctx.report(
        'prefer-div-shorthand',
        `Use shorthand: drop the explicit 'div' before an id/class selector`,
        node.span,
        true,
      );
    }
  },

  'no-empty-class-or-id': (node, ctx) => {
    if (node.classes.some((c) => c === '')) {
      ctx.report('no-empty-class-or-id', 'Empty class selector', node.span, false);
    }
    if (node.id === '') {
      ctx.report('no-empty-class-or-id', 'Empty id selector', node.span, false);
    }
  },

  'component-pascal-case': (node, ctx) => {
    // A tag that isn't a known HTML element and is lowercase-with-no-dash is
    // likely a component written in the wrong case (components are PascalCase;
    // custom elements use a dash).
    if (
      !node.isComponent &&
      !node.isImplicitDiv &&
      /[A-Z]/.test(node.tagName) &&
      !/^[A-Z]/.test(node.tagName)
    ) {
      ctx.report(
        'component-pascal-case',
        `Tag '${node.tagName}' has mixed case — components should be PascalCase, HTML tags lowercase`,
        node.span,
        false,
      );
    }
  },
};

/** Lint NMBL source. Parse errors are surfaced as `parse-error` messages. */
export function lint(source: string, options: LintOptions = {}): LintMessage[] {
  const { ast, errors } = parseToAst(source);
  const messages: LintMessage[] = [];

  for (const err of errors) {
    messages.push({
      ruleId: 'parse-error',
      severity: 'error',
      message: err.message,
      span: err.span,
      fixable: false,
    });
  }

  const setting = (ruleId: string): RuleSetting =>
    options.rules?.[ruleId] ?? DEFAULT_RULES[ruleId] ?? 'off';

  const ctx: RuleContext = {
    setting,
    report: (ruleId, message, span, fixable = false) => {
      const sev = setting(ruleId);
      if (sev === 'off') return;
      messages.push({ ruleId, severity: sev, message, span, fixable });
    },
  };

  walk(ast, (node) => {
    if (node.type !== 'Element') return;
    for (const ruleId of Object.keys(ELEMENT_RULES)) {
      if (setting(ruleId) === 'off') continue;
      ELEMENT_RULES[ruleId](node, ctx);
    }
  });

  // Stable order: by source offset, then rule id.
  messages.sort((a, b) => a.span.start.offset - b.span.start.offset || a.ruleId.localeCompare(b.ruleId));
  return messages;
}

function walk(root: DocumentNode | AstNode, visit: (node: AstNode) => void): void {
  const visitChildren = (children: AstNode[]) => {
    for (const child of children) walkNode(child);
  };
  const walkNode = (node: AstNode) => {
    visit(node);
    switch (node.type) {
      case 'Element':
        visitChildren(node.children);
        break;
      case 'Block':
        for (const clause of (node as BlockNode).clauses) visitChildren(clause.children);
        break;
    }
  };
  if ('type' in root && root.type === 'Document') {
    for (const child of (root as DocumentNode).children) walkNode(child);
  } else {
    walkNode(root as AstNode);
  }
}
