import type { AstroIntegration } from 'astro';
import nmblVitePlugin from '@nmbl/vite-plugin';

export default function nmblAstro(): AstroIntegration {
  return {
    name: '@nmbl/astro',
    hooks: {
      'astro:config:setup'({ updateConfig }) {
        updateConfig({
          vite: { plugins: [nmblVitePlugin()] },
        });
      },
    },
  };
}
