import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import nmbl from '@nmbl/vite-plugin';

export default defineConfig({
  plugins: [
    nmbl({ jsx: { framework: 'solid' } }), // Must come before solid()
    solid(),
  ],
});
