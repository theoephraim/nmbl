/**
 * Runtime stub for the `nmbl` tagged template literal tag.
 *
 * Importing this directly (e.g. `import { nmbl } from '@nmbl-lang/vite-plugin/tag'`)
 * gives TypeScript a typed tag function.  At build time the vite plugin
 * compiles all nmbl`…` expressions away — this stub is never executed in a
 * correctly configured project.
 */

/**
 * NMBL tagged template literal.  Transforms NMBL template syntax into JSX at
 * build time via @nmbl-lang/vite-plugin.
 *
 * @example
 * ```tsx
 * import { nmbl } from '@nmbl-lang/vite-plugin/tag';
 * const el = nmbl`div.card\n  h3 ${title}`;
 * ```
 */
export function nmbl(_strings: TemplateStringsArray, ..._exprs: unknown[]): any {
  throw new Error(
    'nmbl`` templates are compiled at build time — is @nmbl-lang/vite-plugin configured?',
  );
}
