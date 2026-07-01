import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/fire-emblem-srpg/',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
  server: {
    port: 3000,
    open: true,
  },
});
