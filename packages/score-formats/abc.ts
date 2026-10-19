import {MAX_INPUT_BYTES, type AbcTune} from './model';

/** Envelope checks only. Music tokens, duration and pitch are parsed upstream. */
export function inspectAbc(bytes: Uint8Array): {text: string; tunes: AbcTune[]} {
  if (!bytes.length || bytes.length > MAX_INPUT_BYTES) throw Error('File ABC phải từ 1 byte đến 32 MiB.');
  let text: string;
  try {text = new TextDecoder('utf-8', {fatal: true}).decode(bytes).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');}
  catch {throw Error('File ABC cần mã hóa UTF-8 để giữ đúng tên và nội dung bản nhạc.');}
  if (/(?:^\s*%%\s*|\bI:\s*)(?:abc-include|begin(?:js|ps|svg|ml)|javascript|postscript)\b/im.test(text))
    throw Error('ABC có tham chiếu file ngoài hoặc chỉ thị script không được hỗ trợ.');
  if (text.includes('\0') || /<(?:\?xml|!DOCTYPE|score-partwise|score-timewise|museScore)\b/i.test(text)) throw Error('Nội dung không phải ABC hợp lệ.');
  if (!/^\s*K:/m.test(text)) throw Error('ABC thiếu trường K: xác định giọng/khóa của bản nhạc.');
  // Same boundary as abc2xml.getXmlDocs, including its no-X single-tune case.
  const fragments = text.split(/^\s*X:/m), bodies = fragments.length > 1 ? fragments.slice(1) : ['1\n' + text];
  if (bodies.length > 1000) throw Error('File ABC vượt giới hạn 1.000 bài; hãy chia thành file nhỏ hơn.');
  return {text, tunes: bodies.map((body, index) => ({index, id: body.split('\n', 1)[0].trim(),
    title: /^\s*T:\s*([^\n]*)/m.exec(body)?.[1].trim() || `Bài ${index + 1}`}))};
}
