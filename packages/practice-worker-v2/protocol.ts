import type { EngineView, ReplayCommand, Timeline } from '../practice-engine-v2';

export type PracticeWorkerRequest =
  | { type: 'load'; generation: string; timeline: Timeline }
  | { type: 'command'; generation: string; command: ReplayCommand }
  | { type: 'close'; generation: string };

export type PracticeWorkerMessage =
  | { type: 'state' | 'closed'; generation: string; view: EngineView }
  | { type: 'failure'; generation: string; message: string };

export interface PracticeWorker {
  onmessage: ((event: MessageEvent<PracticeWorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: PracticeWorkerRequest): void;
  terminate(): void;
}
