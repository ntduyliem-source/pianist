export const CONVERTER_VERSION = 'abc2xml-2.68+xml2abc-1.77';
export const MAX_INPUT_BYTES = 32 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
export interface FormatDiagnostic {level: 'warning' | 'error'; code: string; message: string}
export interface AbcTune {index: number; id: string; title: string}
export type FormatOperation = 'inspect-abc' | 'abc-to-xml' | 'xml-to-abc';
export interface FormatJob {operation: FormatOperation; text: string; tuneIndex?: number}
export interface FormatResult {
  ok: boolean; text?: string; title?: string; tunes?: AbcTune[]; tuneIndex?: number;
  diagnostics: FormatDiagnostic[]; converter: string; elapsedMs?: number;
}
export type FormatWorkerRequest = FormatJob & {id: number; baseUrl: string};
export type FormatWorkerMessage = {id: number; phase: 'ready'} | {id: number; result: FormatResult};
export class ScoreFormatError extends Error {
  constructor(readonly diagnostics: FormatDiagnostic[]) {
    super(diagnostics.map(item => item.message).join('\n') || 'Không chuyển đổi được bản nhạc.');
    this.name = 'ScoreFormatError';
  }
}
