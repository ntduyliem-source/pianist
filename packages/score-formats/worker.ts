import pins from '../../third_party/score-format-sources/manifest.json';
import adapter from './python/converter.py?raw';
import { CONVERTER_VERSION, type FormatWorkerMessage, type FormatWorkerRequest } from './model';

interface PythonRuntime {
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, data: Uint8Array | string): void;
  };
  globals: {
    set(key: string, value: unknown): void;
    delete(key: string): void;
  };
  runPython(code: string): any;
}
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<FormatWorkerRequest>) => void;
  postMessage(data: FormatWorkerMessage): void;
};
let runtime: Promise<PythonRuntime> | undefined;
let active = false;
async function checked(base: string, path: string, expected: { bytes: number; sha256: string }) {
  const url = new URL(path, base);
  if (url.origin !== location.origin) throw Error('Runtime ABC phải được phục vụ cùng website.');
  const response = await fetch(url);
  if (!response.ok) throw Error(`Thiếu tài nguyên ABC: ${path}.`);
  const data = new Uint8Array(await response.arrayBuffer());
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
  if (data.length !== expected.bytes || hash !== expected.sha256)
    throw Error(`Tài nguyên ABC sai phiên bản: ${path}.`);
  return data;
}
async function initialize(base: string): Promise<PythonRuntime> {
  const entries = await Promise.all(
    pins.runtime.files.map(
      async (item) => [item.path, await checked(base, 'pyodide/' + item.path, item)] as const,
    ),
  );
  const files = new Map(entries);
  const urls: string[] = [];
  const blob = (name: string, type: string) => {
    const url = URL.createObjectURL(new Blob([files.get(name)!.slice().buffer], { type }));
    urls.push(url);
    return url;
  };
  try {
    // Execute the verified bytes. The pinned Pyodide constructor hook lets
    // the loader use the verified WASM without a second unchecked fetch.
    const loaderUrl = blob('pyodide.mjs', 'text/javascript');
    const moduleUrl = blob('pyodide.asm.mjs', 'text/javascript');
    const { loadPyodide } = await import(/* @vite-ignore */ loaderUrl);
    const { default: createModule } = await import(/* @vite-ignore */ moduleUrl);
    const py: PythonRuntime = await loadPyodide({
      indexURL: new URL('pyodide/', base).href,
      stdLibURL: blob('python_stdlib.zip', 'application/zip'),
      lockFileContents: new TextDecoder().decode(files.get('pyodide-lock.json')),
      createPyodideModule: (settings: object) =>
        createModule({
          ...settings,
          wasmBinary: files.get('pyodide.asm.wasm'),
        }),
      packages: [],
      jsglobals: {},
      stdout: () => {},
      stderr: () => {},
    });
    py.FS.mkdir('/score-formats');
    for (const converter of pins.converters) {
      const file = converter.files.find((f) => f.path.endsWith('.py'))!;
      const name = file.path.split('/').at(-1)!;
      py.FS.writeFile('/score-formats/' + name, await checked(base, 'python/' + name, file));
    }
    py.FS.writeFile('/score-formats/converter.py', adapter);
    py.runPython(
      'import sys\nsys.path.insert(0, "/score-formats")\nimport converter as _pianist_converter',
    );
    return py;
  } finally {
    urls.forEach((url) => URL.revokeObjectURL(url));
  }
}
scope.onmessage = async ({ data }) => {
  if (active) return;
  active = true;
  try {
    const py = await (runtime ??= initialize(data.baseUrl));
    scope.postMessage({ id: data.id, phase: 'ready' });
    const start = performance.now();
    py.globals.set(
      '_pianist_request',
      JSON.stringify({
        operation: data.operation,
        text: data.text,
        tuneIndex: data.tuneIndex,
      }),
    );
    try {
      const result = JSON.parse(py.runPython('_pianist_converter.convert_json(_pianist_request)'));
      scope.postMessage({
        id: data.id,
        result: { ...result, elapsedMs: performance.now() - start },
      });
    } finally {
      py.globals.delete('_pianist_request');
    }
  } catch (error) {
    runtime = undefined;
    scope.postMessage({
      id: data.id,
      result: {
        ok: false,
        converter: CONVERTER_VERSION,
        diagnostics: [
          {
            level: 'error',
            code: 'runtime',
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      },
    });
  } finally {
    active = false;
  }
};
