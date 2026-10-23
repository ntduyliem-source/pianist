// Public API only; importing it never starts conversion or a worker.
export { ScoreFormatClient, type ScoreFormatClientOptions } from './client';
export { createScoreFormatWorker, type FormatWorker } from './worker-client';
export { inspectAbc } from './abc';
export { prepareImport, type PreparedScore, type ScoreConverter } from './import';
export { exportAbc, assertAbcFidelity } from './export';
export { CONVERTER_VERSION, MAX_INPUT_BYTES, MAX_OUTPUT_BYTES, ScoreFormatError } from './model';
export type {
  FormatDiagnostic,
  AbcTune,
  FormatOperation,
  FormatJob,
  FormatResult,
  FormatWorkerRequest,
  FormatWorkerMessage,
} from './model';
