/// <reference types="astro/client" />

declare module '*.nmbl' {
  const html: string;
  export default html;
  /** Parsed YAML frontmatter (`---\n…\n---`) from the top of the file; `{}` when absent. */
  export const frontmatter: Record<string, unknown>;
}
