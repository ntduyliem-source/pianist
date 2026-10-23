import type { FormatWorkerMessage, FormatWorkerRequest } from './model';

export interface FormatWorker {
  onmessage: ((event: MessageEvent<FormatWorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: FormatWorkerRequest): void;
  terminate(): void;
}

/** Worker entry points are internal; the factory is safe to import in any host. */
export function createScoreFormatWorker(): FormatWorker {
  return new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  });
}
