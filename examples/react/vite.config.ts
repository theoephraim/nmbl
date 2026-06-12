import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import nmbl from '@nmbl/vite-plugin';

export default defineConfig({
  plugins: [
    nmbl({ jsx: { framework: 'react' } }), // Must come before react()
    react(),
  ],
});
