import { decodeNativePracticeSnapshot } from '../score-contracts';
import type { RenderedExercise } from './index';

import { captureRendererSnapshotJson, type RendererNativeModule } from './native-snapshot';

type Asset = { path: string; bytes: number; sha256: string };
const scope = self as unknown as {
  onmessage: (event: MessageEvent) => void;
  postMessage: (data: unknown) => void;
};
let module: RendererNativeModule,
  version = '',
  initializing: Promise<void> | undefined;
let chain = Promise.resolve();
const cache = new Map<string, string>();
let cachedBytes = 0;
const cacheLimit = 16 * 1024 * 1024;
const sha = async (bytes: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

async function init(baseUrl: string) {
  const base = new URL(baseUrl),
    response = await fetch(new URL('release.json', base));
  if (!response.ok) throw Error('Không tải được manifest renderer.');
  const release = (await response.json()) as { files: Asset[] };
  const load = async (path: string) => {
    const expected = release.files.find((a) => a.path === path);
    if (!expected) throw Error('Bản phát hành chưa có renderer.');
    const r = await fetch(new URL(path, base));
    if (!r.ok) throw Error('Không tải được ' + path);
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length !== expected.bytes || (await sha(bytes)) !== expected.sha256)
      throw Error('Tài nguyên renderer không khớp bản phát hành.');
    return { bytes, hash: expected.sha256 };
  };
  const [glue, wasm] = await Promise.all([
    load('renderer/PianistRenderer.mjs'),
    load('renderer/PianistRenderer.wasm'),
  ]);
  version = wasm.hash;
  const url = URL.createObjectURL(new Blob([glue.bytes.buffer], { type: 'text/javascript' }));
  try {
    const { default: create } = await import(/* @vite-ignore */ url);
    let resolveReady!: () => void;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    // The verified ES module runs from a blob URL. Emscripten still computes a
    // WASM URL even with wasmBinary; locateFile avoids resolving against blob:.
    module = await create({
      wasmBinary: wasm.bytes,
      locateFile: (path: string) => new URL('renderer/' + path, base).href,
      onRendererReady: resolveReady,
      print: () => {},
      printErr: (message: string) => console.warn('[renderer]', message),
    });
    await ready;
  } finally {
    URL.revokeObjectURL(url);
  }
  scope.postMessage({ type: 'ready', version });
}
function remember(key: string, json: string) {
  const size = json.length * 2;
  if (size > cacheLimit) return;
  while (cache.size && cachedBytes + size > cacheLimit) {
    const first = cache.keys().next().value!;
    cachedBytes -= cache.get(first)!.length * 2;
    cache.delete(first);
  }
  cache.set(key, json);
  cachedBytes += size;
}
async function render(id: number, filename: string, buffer: ArrayBuffer) {
  const started = performance.now(),
    bytes = new Uint8Array(buffer),
    sourceHash = await sha(bytes);
  const key = version + ':' + sourceHash + ':' + filename;
  let json: unknown = cache.get(key);
  const cacheHit = json !== undefined;
  if (typeof json === 'string') {
    cache.delete(key);
    cache.set(key, json);
  } else {
    json = captureRendererSnapshotJson(module, bytes, filename);
  }
  if (typeof json !== 'string') throw Error('Snapshot renderer không tương thích.');
  const snapshot = decodeNativePracticeSnapshot(json);
  if (!cacheHit) remember(key, json);
  scope.postMessage({
    type: 'result',
    id,
    result: {
      snapshot,
      sourceHash,
      rendererVersion: version,
      elapsedMs: performance.now() - started,
      cacheHit,
      heapBytes: module.HEAPU8.byteLength,
    } satisfies RenderedExercise,
  });
}
scope.onmessage = ({ data }) => {
  if (data.type === 'init') {
    initializing ??= init(data.baseUrl).catch((error) => {
      scope.postMessage({ type: 'fatal', error: String(error) });
      throw error;
    });
    // Consumer requests also observe this rejection; avoid an unhandled promise.
    void initializing.catch(() => {});
    return;
  }
  if (data.type !== 'render') return;
  chain = chain.then(async () => {
    try {
      if (!initializing) throw Error('Renderer chưa được khởi động.');
      await initializing;
      await render(data.id, data.filename, data.bytes);
    } catch (error) {
      scope.postMessage({
        type: error instanceof WebAssembly.RuntimeError ? 'fatal' : 'error',
        id: data.id,
        error: String(error),
      });
    }
  });
};
