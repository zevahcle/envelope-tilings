import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build` → dist/ (static site for GitHub Pages).
// `SINGLE=1 vite build` → dist-single/index.html, one self-contained file that works from disk.
const single = process.env.SINGLE === '1';

export default defineConfig({
  base: './',
  plugins: single ? [viteSingleFile()] : [],
  build: { target: 'es2022', sourcemap: !single, outDir: single ? 'dist-single' : 'dist' },
  test: { include: ['test/**/*.test.ts'] },
});
