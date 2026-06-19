/**
 * Default `md` content-block filter — `div.prose:md` bodies render as markdown.
 *
 * A separate entry point (`@nmbl-lang/core/markdown`) so the renderer is only
 * bundled where it's used. Synchronous and browser-safe, so it works in core's
 * sync `compile()`, every build integration, and the in-browser playground.
 * The Astro integration overrides it with the project's own remark pipeline;
 * this is the everywhere-else default (CommonMark + GFM, raw inline HTML
 * passes through).
 */
import { Marked } from 'marked';

const marked = new Marked({ gfm: true, async: false });

/**
 * The rendered markdown is spliced into a host template that the framework
 * still parses — `{expr}` / `{{ expr }}` interpolation and component tags keep
 * working inside prose (the MDX-like behavior). But a brace inside a CODE
 * element is content, not an expression, so escape those. Entities render
 * identically in every target, including plain HTML.
 */
export function escapeCodeBraces(html: string): string {
  return html.replace(
    /(<code[^>]*>)([\s\S]*?)(<\/code>)/g,
    (_m, open: string, body: string, close: string) =>
      open + body.replace(/[{}]/g, c => (c === '{' ? '&#123;' : '&#125;')) + close,
  );
}

/** Render a `:md` content-block body to HTML. */
export function mdFilter(body: string): string {
  return escapeCodeBraces(marked.parse(body) as string);
}
