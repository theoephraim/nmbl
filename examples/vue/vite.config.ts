import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import nmbl from '@nmbl/vite-plugin';

export default defineConfig({
  plugins: [
    nmbl(), // Must come before vue() to preprocess templates
    vue(),
  ],
});