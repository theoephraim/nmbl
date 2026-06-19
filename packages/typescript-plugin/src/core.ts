/**
 * core.ts
 *
 * Pure logic for the NMBL TypeScript plugin — no tsserver/runtime state, so it
 * can be unit-tested against the plain `typescript` API.
 *
 * The job: tsserver can't see identifiers referenced *inside* an `` nmbl`…` ``
 * tagged template (component tags like `Badge(...)`, or bare names used in
 * `{expr}` text), because the template body is, to TS, an opaque string. So a
 * component that is imported and only ever used in the template gets flagged
 * "declared but never used" (TS 6133 and friends). We collect every identifier
 * that appears in the literal portions of `` nmbl`…` `` templates and suppress
 * the unused-declaration diagnostics for those names.
 *
 * We deliberately DON'T touch `${…}` substitution expressions — those are real
 * AST nodes that TS already counts as uses. Only the literal text chunks
 * (`head` / `templateSpans[].literal`) are opaque, so only those feed the set.
 */

import type * as ts from 'typescript';

/** The shape of the `typescript` module value passed in at runtime. */
type TsModule = typeof import('typescript');

/**
 * Diagnostic codes for "declared but never used" in its various shapes. We only
 * ever *remove* diagnostics with these codes, and only when the declared name
 * is referenced inside an nmbl template — never anything else.
 */
export const UNUSED_CODES: ReadonlySet<number> = new Set([
  6133, // 'X' is declared but its value is never read.
  6138, // Property 'X' is declared but its value is never read.
  6192, // All imports in import declaration are unused.
  6196, // 'X' is declared but never used. (types)
  6198, // All destructured elements are unused.
  6199, // All variables are unused.
  6205, // All type parameters are unused.
]);

/** Reserved words that can appear in a diagnostic's source slice but are never references. */
const KEYWORDS: ReadonlySet<string> = new Set([
  'import',
  'export',
  'from',
  'as',
  'type',
  'const',
  'let',
  'var',
  'default',
  'function',
  'class',
  'interface',
]);

const IDENT_RE = /[A-Za-z_$][\w$]*/g;

/** Every identifier-shaped token in a string. */
function tokenize(text: string): string[] {
  return text.match(IDENT_RE) ?? [];
}

/**
 * Collect the names referenced in the literal text of every `` nmbl`…` ``
 * tagged template in a source file.
 *
 * @param tsModule - the `typescript` module (passed in for testability).
 * @param sourceFile - a parsed source file.
 * @param tagName - the tag identifier to look for (default `nmbl`).
 */
export function collectNmblIdentifiers(
  tsModule: TsModule,
  sourceFile: ts.SourceFile,
  tagName = 'nmbl',
): Set<string> {
  const names = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (
      tsModule.isTaggedTemplateExpression(node) &&
      tsModule.isIdentifier(node.tag) &&
      node.tag.text === tagName
    ) {
      for (const chunk of literalChunks(tsModule, node.template)) {
        for (const tok of tokenize(chunk)) names.add(tok);
      }
    }
    tsModule.forEachChild(node, visit);
  };
  visit(sourceFile);

  return names;
}

/** The raw literal text chunks of a template, excluding `${…}` substitutions. */
function literalChunks(tsModule: TsModule, template: ts.TemplateLiteral): string[] {
  if (tsModule.isNoSubstitutionTemplateLiteral(template)) {
    return [template.text];
  }
  const chunks = [template.head.text];
  for (const span of template.templateSpans) {
    chunks.push(span.literal.text);
  }
  return chunks;
}

/**
 * Decide whether an "unused declaration" diagnostic is a false positive caused
 * by the declared name being used only inside an nmbl template.
 *
 * Returns true only when (a) the code is one of {@link UNUSED_CODES}, (b) the
 * diagnostic belongs to `sourceFile`, and (c) at least one identifier in the
 * flagged span is present in `nmblIdentifiers`.
 */
export function shouldFilterUnusedDiagnostic(
  diagnostic: ts.Diagnostic,
  sourceFile: ts.SourceFile,
  nmblIdentifiers: ReadonlySet<string>,
): boolean {
  if (!UNUSED_CODES.has(diagnostic.code)) return false;
  if (diagnostic.file?.fileName !== sourceFile.fileName) return false;
  if (typeof diagnostic.start !== 'number' || typeof diagnostic.length !== 'number') {
    return false;
  }

  const slice = sourceFile.text.substr(diagnostic.start, diagnostic.length);
  for (const tok of tokenize(slice)) {
    if (KEYWORDS.has(tok)) continue;
    if (nmblIdentifiers.has(tok)) return true;
  }
  return false;
}

/**
 * Filter an array of diagnostics, dropping the unused-declaration false
 * positives. Pure: caller supplies the parsed source file and the precomputed
 * identifier set.
 */
export function filterUnusedDiagnostics<T extends ts.Diagnostic>(
  diagnostics: readonly T[],
  sourceFile: ts.SourceFile,
  nmblIdentifiers: ReadonlySet<string>,
): T[] {
  if (nmblIdentifiers.size === 0) return diagnostics.slice();
  return diagnostics.filter(
    (d) => !shouldFilterUnusedDiagnostic(d, sourceFile, nmblIdentifiers),
  );
}
