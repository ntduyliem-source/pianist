import { Unzip, UnzipInflate } from 'fflate';
import {inspectAbc} from '../../../../packages/score-formats/abc';
import {prepareImport, type ScoreConverter, type PreparedScore} from '../../../../packages/score-formats';
const MAX = 32 * 1024 * 1024, EXPANDED = 64 * 1024 * 1024;
function checkEntities(text: string): void {
  if (/<!ENTITY\s/i.test(text) || /<!DOCTYPE[^>]*(?:SYSTEM|PUBLIC)\s+(?!["']-\/\/Recordare)/i.test(text)) throw Error('Không hỗ trợ XML có external entity.');
}
export async function validateFile(bytes: Uint8Array, filename: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (!bytes.length || bytes.length > MAX) throw Error('File phải từ 1 byte đến 32 MiB.');
  const ext = filename.split('.').at(-1)?.toLowerCase();
  if (!['abc', 'mxl', 'xml', 'musicxml', 'mscz', 'mscx'].includes(ext ?? '')) throw Error('Chọn file ABC, MXL, MusicXML hoặc MuseScore.');
  if (ext === 'abc') {inspectAbc(bytes); return;}
  if (ext === 'mxl' || ext === 'mscz') {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw Error('File nén không phải ZIP hợp lệ.');
    let total = 0, entries = 0;
    // Streaming inflate is bounded by actual output, not the untrusted ZIP size fields.
    const unzip = new Unzip(file => {
      if (++entries > 2048 || file.originalSize && file.originalSize > EXPANDED
        || file.name.startsWith('/') || file.name.includes('\\') || file.name.split('/').includes('..') || /^[a-z]:/i.test(file.name)) throw Error('Cấu trúc file ZIP không an toàn hoặc quá lớn.');
      const xml = /\.(?:xml|musicxml|mscx)$/i.test(file.name), decoder = new TextDecoder(); let tail = '';
      file.ondata = (err, data, final) => {
        if (err) throw err; total += data.length;
        if (total > EXPANDED) throw Error('File giải nén vượt giới hạn 64 MiB.');
        if (xml) {const text = tail + decoder.decode(data, {stream: !final}); checkEntities(text); tail = text.slice(-4096);}
      };
      file.start();
    });
    unzip.register(UnzipInflate);
    for (let p = 0; p < bytes.length; p += 1024) {
      signal?.throwIfAborted();
      unzip.push(bytes.subarray(p, p + 1024), p + 1024 >= bytes.length);
      if (p % (256 * 1024) === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    if (!entries || !total) throw Error('File ZIP rỗng hoặc bị hỏng.');
  } else {
    const text = new TextDecoder().decode(bytes);
    checkEntities(text);
    if (!/<(?:score-partwise|score-timewise|museScore)\b/.test(text)) throw Error('Không tìm thấy nội dung bản nhạc.');
  }
}
export async function prepareScoreFile(bytes: Uint8Array, filename: string, converter: ScoreConverter,
  signal?: AbortSignal, onReady?: () => void, tuneIndex?: number): Promise<PreparedScore> {
  await validateFile(bytes, filename, signal);
  const prepared = await prepareImport(bytes, filename, converter, signal, onReady, tuneIndex);
  if (/\.abc$/i.test(filename)) {
    // Generated XML has a separate 64 MiB limit; source files remain 32 MiB.
    if (!prepared.bytes.length || prepared.bytes.length > EXPANDED) throw Error('MusicXML sinh ra rỗng hoặc vượt giới hạn 64 MiB.');
    const text = new TextDecoder().decode(prepared.bytes); checkEntities(text);
    if (!/<score-partwise\b/.test(text)) throw Error('Converter không tạo được bản nhạc MusicXML.');
    if (typeof DOMParser !== 'undefined') {
      const parsed = new DOMParser().parseFromString(text, 'application/xml');
      if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'score-partwise') throw Error('MusicXML do converter tạo ra không hợp lệ.');
    }
  }
  signal?.throwIfAborted();
  return prepared;
}
export function download(bytes: Uint8Array | string, filename: string, type = 'application/octet-stream'): void {
  const blob = new Blob([typeof bytes === 'string' ? bytes : bytes.slice().buffer as ArrayBuffer], {type});
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function fingerprint(value: unknown): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('');
}
