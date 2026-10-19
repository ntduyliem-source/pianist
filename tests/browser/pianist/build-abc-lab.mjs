import {build} from '../../../apps/pianist-web/node_modules/vite/dist/node/index.js';
import {fileURLToPath} from 'node:url';
import {mkdir, writeFile} from 'node:fs/promises';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = root + 'build.artifacts/abc-lab';
await build({configFile: false, root, base: './', worker: {format: 'es'},
  build: {outDir: output, emptyOutDir: true, sourcemap: true,
    lib: {entry: fileURLToPath(new URL('./abc-lab.ts', import.meta.url)), formats: ['es'], fileName: () => 'lab.js'}}});
await mkdir(output, {recursive: true});
await writeFile(output + '/index.html', '<!doctype html><html lang="vi"><meta charset="utf-8"><title>ABC converter verification</title><p id="status">Loading</p><script type="module" src="./lab.js"></script></html>');
