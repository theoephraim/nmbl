import type { AstroIntegration } from 'astro';
import nmblVitePlugin from '@nmbl-lang/vite-plugin';
import { escapeCodeBraces } from '@nmbl-lang/core/markdown';
import { createMarkdownProcessor, type MarkdownProcessor } from '@astrojs/markdown-remark';

type ConfigSetup = NonNullable<AstroIntegration['hooks']['astro:config:setup']>;
type AstroVitePlugins = NonNullable<
  NonNullable<Parameters<Parameters<ConfigSetup>[0]['updateConfig']>[0]['vite']>['plugins']
>;

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
        // The processor is created lazily on the first `:md` block, from the
        // RESOLVED markdown config — integrations that ran before this one
        // (e.g. expressive-code) have already added their remark plugins.
        let processor: Promise<MarkdownProcessor> | undefined;
        const md = async (body: string): Promise<string> => {
          processor ??= createMarkdownProcessor(config.markdown);
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
