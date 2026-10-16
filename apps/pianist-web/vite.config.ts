import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  base: './',
  define: {'process.env.NODE_ENV': JSON.stringify('production')},
  build: {
    outDir: '../../build.artifacts/app', emptyOutDir: true, sourcemap: true,
    lib: {entry: resolve(import.meta.dirname, 'src/main.tsx'), formats: ['es'], fileName: () => 'pianist.js', cssFileName: 'pianist'},
  },
  worker: {format: 'es'},
});
