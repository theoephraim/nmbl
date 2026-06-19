import type { AstroIntegration } from 'astro';
import nmblVitePlugin from '@nmbl-lang/vite-plugin';
import { escapeCodeBraces } from '@nmbl-lang/core/markdown';
import { createMarkdownProcessor, type MarkdownProcessor } from '@astrojs/markdown-remark';

type ConfigSetup = NonNullable<AstroIntegration['hooks']['astro:config:setup']>;
type AstroConfig = Parameters<ConfigSetup>[0]['config'];
type AstroVitePlugins = NonNullable<
  NonNullable<Parameters<Parameters<ConfigSetup>[0]['updateConfig']>[0]['vite']>['plugins']
>;

/** The subset of `.render()` we use — shared by a `MarkdownProcessor` and the
 *  renderer returned from `markdown.processor.createRenderer()`. */
type Renderer = Pick<MarkdownProcessor, 'render'>;

/** Astro 6+ stores the markdown processor shared by `.md`/`.mdx` files on
 *  `config.markdown.processor` (a `{ createRenderer }` factory). The public
 *  `AstroConfig['markdown']` type doesn't surface it, so widen it here. */
type SharedProcessor = {
  createRenderer: (shared: Record<string, unknown>) => Promise<Renderer>;
};

export interface NmblAstroOptions {
  /**
   * Render `:md` content blocks (e.g. `div.prose:md`) as markdown using the
   * project's own Astro markdown pipeline — the same remark/rehype plugins and
   * syntax highlighting `.md` files get. Default: true.
   */
  markdown?: boolean;
}

export default function nmblAstro(options: NmblAstroOptions = {}): AstroIntegration {
  return {
    name: '@nmbl-lang/astro',
    hooks: {
      'astro:config:setup'({ config, updateConfig }) {
        // The renderer is resolved lazily on the first `:md` block, so it
        // reflects the fully-resolved markdown config — including plugins added
        // by integrations that run after this one. See `resolveRenderer`.
        let processor: Promise<Renderer> | undefined;
        const md = async (body: string): Promise<string> => {
          processor ??= resolveRenderer(config);
          const { code } = await (await processor).render(body);
          return escapeCodeBraces(code);
        };

        updateConfig({
          // @nmbl-lang/vite-plugin is typed against its own Vite version, which can
          // differ from the major Astro bundles. The plugin shape is compatible at
          // runtime, so widen it to Astro's own Vite plugin type rather than `any`.
          vite: {
            plugins: [
              nmblVitePlugin({
                framework: 'astro',
                filters: options.markdown === false ? undefined : { md },
              }),
            ] as unknown as AstroVitePlugins,
          },
        });
      },
    },
  };
}

/**
 * Resolve the markdown renderer used for `:md` bodies.
 *
 * We want `:md` blocks to render IDENTICALLY to `.md`/`.mdx` files — same
 * remark/rehype plugins, same syntax highlighting. Astro 6+ builds one shared
 * processor for those files and exposes it on `config.markdown.processor` (a
 * `{ createRenderer }` factory). We reuse it via the same call Astro core makes
 * internally.
 *
 * Reusing it matters because some integrations attach their highlighting ONLY
 * to that shared processor, not to the plain `config.markdown` plugin arrays —
 * most notably astro-expressive-code, which pushes its rehype plugin onto
 * `config.markdown.processor.options.rehypePlugins` AND sets
 * `syntaxHighlight: false`. A standalone `createMarkdownProcessor(config.markdown)`
 * would inherit `syntaxHighlight: false` but miss EC's plugin, leaving fenced
 * code in `:md` blocks as bare, unhighlighted `<pre>`.
 *
 * Fall back to a standalone processor when no shared processor is present
 * (older Astro, or a setup without one) — there the default Shiki highlighting
 * lives in `config.markdown` and builds correctly on its own.
 */
function resolveRenderer(config: AstroConfig): Promise<Renderer> {
  const markdown = config.markdown;
  const shared = (markdown as { processor?: SharedProcessor }).processor;
  if (shared && typeof shared.createRenderer === 'function') {
    // Mirror astro/dist/vite-plugin-markdown's `createRenderer({...})` call so
    // `:md` blocks see the same highlighting + options as real `.md` files.
    return shared.createRenderer({
      image: config.image,
      syntaxHighlight: markdown.syntaxHighlight,
      shikiConfig: markdown.shikiConfig,
      gfm: markdown.gfm,
      smartypants: markdown.smartypants,
    });
  }
  // `markdown` is typed against Astro's bundled markdown-remark, which can be a
  // different major than the one this package pins (e.g. `smartypants` widened
  // from `boolean` to an options object). The shapes are runtime-compatible, so
  // widen to the parameter type rather than chase the version skew.
  return createMarkdownProcessor(markdown as Parameters<typeof createMarkdownProcessor>[0]);
}
