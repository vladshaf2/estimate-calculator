import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base so the app works under any sub-path (GitHub Pages: /estimate-calculator/planner/).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 800 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
