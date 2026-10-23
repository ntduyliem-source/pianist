/** Minimal synchronous renderer exports. No browser/editor state crosses here. */
export interface RendererNativeModule {
  HEAPU8: Uint8Array;
  _malloc(size: number): number;
  _free(ptr: number): void;
  ccall(name: string, returns: string, types: string[], args: unknown[]): number;
  onPreparedSnapshot?: (json: string) => void;
}

/** Capture first, validate after both native project and input memory are freed. */
export function captureRendererSnapshotJson(
  module: RendererNativeModule,
  bytes: Uint8Array,
  filename: string,
): string {
  const previous = module.onPreparedSnapshot;
  const ptr = module._malloc(bytes.length);
  if (!ptr) throw Error('Không đủ bộ nhớ để dựng câu tập.');
  let raw: unknown,
    success = 0;
  try {
    module.HEAPU8.set(bytes, ptr);
    module.onPreparedSnapshot = (value) => {
      raw = value;
    };
    success = module.ccall(
      'preparePracticeSnapshot',
      'number',
      ['number', 'number', 'string'],
      [ptr, bytes.length, filename],
    );
  } finally {
    // Even an exceptional allocator wrapper must not strand our callback.
    try {
      module._free(ptr);
    } finally {
      module.onPreparedSnapshot = previous;
    }
  }
  if (!success || typeof raw !== 'string') throw Error('MuseScore không đọc được câu tập này.');
  return raw;
}
