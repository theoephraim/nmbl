// @ts-check
import { defineConfig } from 'astro/config';
import nmbl from '@nmbl-lang/astro';

// https://astro.build/config
export default defineConfig({
  integrations: [nmbl()],
});
