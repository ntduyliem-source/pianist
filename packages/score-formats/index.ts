import {inspectAbc} from './abc';
import type {ScoreFormatClient} from './client';
import {MAX_OUTPUT_BYTES, type FormatDiagnostic} from './model';

export interface PreparedScore {bytes: Uint8Array; filename: string; title?: string; diagnostics: FormatDiagnostic[]}
export type ScoreConverter = Pick<ScoreFormatClient, 'run'>;

/** One import contract: native inputs pass through; ABC becomes MusicXML once. */
export async function prepareImport(bytes: Uint8Array, filename: string, converter: ScoreConverter,
  signal?: AbortSignal, onReady?: () => void, tuneIndex?: number): Promise<PreparedScore> {
  signal?.throwIfAborted();
  if (!/\.abc$/i.test(filename)) return {bytes, filename, diagnostics: []};
  const source = inspectAbc(bytes);
  if (source.tunes.length !== 1 && tuneIndex === undefined) throw Error(`File ABC có ${source.tunes.length} bài. Hãy chọn bài trước khi nhập. Không có bài nào được nhập.`);
  const index = tuneIndex ?? 0, tune = source.tunes[index];
  if (!Number.isInteger(index) || !tune) throw Error('Bài ABC được chọn không tồn tại.');
  const result = await converter.run({operation: 'abc-to-xml', text: source.text, tuneIndex: index}, signal, onReady);
  signal?.throwIfAborted();
  if (!result.ok || !result.text) throw Error('Bộ chuyển đổi chưa tạo được MusicXML.');
  const output = new TextEncoder().encode(result.text);
  if (output.length > MAX_OUTPUT_BYTES) throw Error('MusicXML chuyển từ ABC vượt giới hạn 64 MiB.');
  return {bytes: output, filename: filename.replace(/\.abc$/i, '.musicxml'),
    title: (tune.hasTitle ? tune.title : `${filename.replace(/\.abc$/i, '')} — ${index + 1}`).trim().slice(0, 150), diagnostics: result.diagnostics};
}
