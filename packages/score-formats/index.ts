import {inspectAbc} from './abc';
import type {ScoreFormatClient} from './client';
import {MAX_OUTPUT_BYTES, type FormatDiagnostic} from './model';

export interface PreparedScore {bytes: Uint8Array; filename: string; title?: string; diagnostics: FormatDiagnostic[]}
export type ScoreConverter = Pick<ScoreFormatClient, 'run'>;

/** One import contract: native inputs pass through; ABC becomes MusicXML once. */
export async function prepareImport(bytes: Uint8Array, filename: string, converter: ScoreConverter,
  signal?: AbortSignal, onReady?: () => void): Promise<PreparedScore> {
  signal?.throwIfAborted();
  if (!/\.abc$/i.test(filename)) return {bytes, filename, diagnostics: []};
  const source = inspectAbc(bytes);
  if (source.tunes.length !== 1) throw Error(`File ABC có ${source.tunes.length} bài. Hiện hãy tách mỗi bài thành một file ABC; chọn nhiều bài chưa được hỗ trợ. Không có bài nào được nhập.`);
  const result = await converter.run({operation: 'abc-to-xml', text: source.text, tuneIndex: 0}, signal, onReady);
  signal?.throwIfAborted();
  if (!result.ok || !result.text) throw Error('Bộ chuyển đổi chưa tạo được MusicXML.');
  const output = new TextEncoder().encode(result.text);
  if (output.length > MAX_OUTPUT_BYTES) throw Error('MusicXML chuyển từ ABC vượt giới hạn 64 MiB.');
  return {bytes: output, filename: filename.replace(/\.abc$/i, '.musicxml'),
    title: (result.title || source.tunes[0].title).trim().slice(0, 150), diagnostics: result.diagnostics};
}
