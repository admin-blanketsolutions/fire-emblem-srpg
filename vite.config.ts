import { defineConfig } from 'vite';

// GitHub Pages serves the site under /<repo>/, so CI sets VITE_BASE; local dev uses '/'.
export default defineConfig({
  base: process.env['VITE_BASE'] ?? '/',
  build: {
    outDir: 'dist',
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  server: {
    port: 3000,
  },
});
