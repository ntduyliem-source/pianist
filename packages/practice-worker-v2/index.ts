import type { PracticeWorker } from './protocol';

export type { PracticeWorker, PracticeWorkerRequest, PracticeWorkerMessage } from './protocol';

/** Importing the package does not start a worker or install its message handler. */
export function createPracticeWorker(): PracticeWorker {
  return new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  });
}
