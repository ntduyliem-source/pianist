import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  base: './',
  define: {'process.env.NODE_ENV': JSON.stringify('production')},
  build: {
    outDir: '../../build.artifacts/app', emptyOutDir: true, sourcemap: true,
    lib: {entry: {
      pianist: resolve(import.meta.dirname, 'src/main.tsx'),
      'exercise-renderer': resolve(import.meta.dirname, '../../packages/exercise-renderer/index.ts'),
      'library-thumbnail': resolve(import.meta.dirname, 'src/platform/score-thumbnail.ts'),
    }, formats: ['es'], fileName: (_format,name) => name+'.js', cssFileName: 'pianist'},
  },
  worker: {format: 'es'},
});
