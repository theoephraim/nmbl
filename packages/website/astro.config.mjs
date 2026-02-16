import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import nmbl from '@nmbl/astro';

export default defineConfig({
  integrations: [vue(), nmbl()],
});
