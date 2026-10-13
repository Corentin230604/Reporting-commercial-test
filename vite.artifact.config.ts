import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Version hébergée sur Claude : un seul bundle JS + CSS, intégrés ensuite dans la page.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-artifact',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100000,
    rollupOptions: {
      input: 'src/artifact.tsx',
      output: { entryFileNames: 'app.js', assetFileNames: 'app.[ext]', inlineDynamicImports: true },
    },
  },
});
