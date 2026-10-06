import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths so the build works from any static host or sub-folder.
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
