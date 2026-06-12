import type { AstroIntegration } from 'astro';
import nmblVitePlugin from '@nmbl-lang/vite-plugin';

type ConfigSetup = NonNullable<AstroIntegration['hooks']['astro:config:setup']>;
type AstroVitePlugins = NonNullable<
  NonNullable<Parameters<Parameters<ConfigSetup>[0]['updateConfig']>[0]['vite']>['plugins']
>;

export default function nmblAstro(): AstroIntegration {
  return {
    name: '@nmbl-lang/astro',
    hooks: {
      'astro:config:setup'({ updateConfig }) {
        updateConfig({
          // @nmbl-lang/vite-plugin is typed against its own Vite version, which can
          // differ from the major Astro bundles. The plugin shape is compatible at
          // runtime, so widen it to Astro's own Vite plugin type rather than `any`.
          vite: {
            plugins: [nmblVitePlugin({ framework: 'astro' })] as unknown as AstroVitePlugins,
          },
        });
      },
    },
  };
}
