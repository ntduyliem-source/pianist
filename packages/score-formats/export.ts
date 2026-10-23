import type { EngineBridge } from '../engine-bridge';
import type { ScoreMusic } from '../score-contracts';
import { prepareImport, type ScoreConverter } from './import';
import { MAX_INPUT_BYTES, MAX_OUTPUT_BYTES, type FormatDiagnostic } from './model';

const sorted = <T>(items: T[]) =>
  items.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
/** A conversion fidelity check, never a practice matcher or timing tolerance.
 * Both sides are interpreted by the same upstream MuseScore native exporter.
 * Strip layout and regenerated IDs; retain musical relationships and counts.
 */
function music(score: ScoreMusic) {
  const parts = [...new Set(score.staves.map((s) => s.partId))];
  const anchors = new Map(
    score.anchors.map((n) => [n.id, [n.tick, n.pitch, n.durationTicks, n.staff, n.voice]]),
  );
  const groups = new Map<string, unknown[]>();
  for (const note of score.anchors)
    if (note.arpeggioGroup) {
      if (!groups.has(note.arpeggioGroup)) groups.set(note.arpeggioGroup, []);
      groups.get(note.arpeggioGroup)!.push(anchors.get(note.id));
    }
  for (const group of groups.values()) sorted(group);
  return {
    rests: sorted([...(score.rests ?? [])]),
    keys: sorted([...(score.keys ?? [])]),
    slurs: sorted([...(score.slurs ?? [])]),
    dynamics: sorted([...(score.dynamics ?? [])]),
    staves: score.staves.map((s) => [s.id, parts.indexOf(s.partId)]),
    notes: sorted(
      score.anchors.map((n) => ({
        identity: anchors.get(n.id),
        spelling: n.spelling,
        visualStaff: n.visualStaff,
        play: n.play,
        userVelocity: n.userVelocity,
        tie: n.tieBack ? anchors.get(n.tieBack) : null,
        articulations: sorted([...(n.articulations ?? [])]),
        arpeggio: n.arpeggio ?? null,
        arpeggioGroup: n.arpeggioGroup ? groups.get(n.arpeggioGroup) : null,
      })),
    ),
    measures: score.measures.map((m) => [m.tick, m.endTick, m.numerator, m.denominator]),
    performed: sorted(
      score.performed.map((p) => ({
        anchor: anchors.get(p.anchor),
        occurrence: p.occurrence,
        atMs: p.atMs,
        endMs: p.endMs,
      })),
    ),
    occurrences: score.occurrences,
    beats: score.beats,
    releases: sorted(
      (score.keyReleases ?? []).map((p) => ({
        anchor: anchors.get(p.anchor),
        pitch: p.pitch,
        utick: p.utick,
        endUtick: p.endUtick,
        atMs: p.atMs,
        endMs: p.endMs,
      })),
    ),
    pedals: sorted(
      (score.pedals ?? []).map((p) => ({
        part: parts.indexOf(p.partId),
        occurrence: p.occurrence,
        tick: p.tick,
        endTick: p.endTick,
        atMs: p.atMs,
        endMs: p.endMs,
      })),
    ),
    durationMs: score.durationMs,
    baseQuarterBpm: score.baseQuarterBpm,
  };
}
function equivalent(a: unknown, b: unknown, key = ''): boolean {
  if (typeof a === 'number' && typeof b === 'number')
    return (
      Number.isFinite(a) &&
      Number.isFinite(b) &&
      (key.endsWith('Ms') ? Math.abs(a - b) <= 1e-6 : a === b)
    );
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((value, i) => equivalent(value, b[i], key));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const x = a as Record<string, unknown>,
      y = b as Record<string, unknown>;
    return (
      Object.keys(x).length === Object.keys(y).length &&
      Object.keys(x).every((k) => Object.hasOwn(y, k) && equivalent(x[k], y[k], k))
    );
  }
  return a === b;
}
export function assertAbcFidelity(before: ScoreMusic, after: ScoreMusic): void {
  const a = music(before),
    b = music(after);
  const labels: Record<keyof typeof a, string> = {
    rests: 'dấu nghỉ',
    keys: 'hóa biểu',
    slurs: 'dấu luyến',
    dynamics: 'sắc thái và cường độ âm thanh',
    staves: 'tay/khuông',
    notes: 'nốt, bè, cường độ từng nốt, tie hoặc articulation',
    measures: 'ô nhịp',
    performed: 'thời điểm nốt',
    occurrences: 'thứ tự lặp',
    beats: 'nhịp/BPM',
    releases: 'mốc nhả phím',
    pedals: 'pedal',
    durationMs: 'thời lượng',
    baseQuarterBpm: 'tempo',
  };
  for (const key of Object.keys(a) as (keyof typeof a)[])
    if (!equivalent(a[key], b[key], key))
      throw Error(
        `ABC không giữ nguyên ${labels[key]} khi mở lại bằng MuseScore. Chưa xuất file; hãy dùng MXL hoặc MSCZ.`,
      );
}
export async function exportAbc(
  bridge: EngineBridge,
  converter: ScoreConverter,
  signal?: AbortSignal,
): Promise<{ text: string; diagnostics: FormatDiagnostic[] }> {
  signal?.throwIfAborted();
  const revision = bridge.revision,
    xml = bridge.musicXml(),
    before = bridge.semantics();
  const expressions: Record<string, string> = {
    grace: 'grace note',
    ornament: 'ornament',
    fermata: 'fermata',
    'custom-key': 'hóa biểu tùy chỉnh',
  };
  const unsupported = before.warnings.filter((w) => expressions[w]);
  if (unsupported.length)
    throw Error(
      `ABC chưa được kiểm chứng cho ${unsupported.map((w) => expressions[w]).join(', ')} của bài này. Hãy xuất MXL/MSCZ để giữ đủ thông tin.`,
    );
  // EngineBridge has already validated the complete native semantics contract,
  // including explicit zero velocity, rests, keys, slurs and dynamics.
  if (xml.length > MAX_OUTPUT_BYTES) throw Error('MusicXML vượt giới hạn 64 MiB. Hãy lưu MSCZ.');
  const output = await converter.run(
    { operation: 'xml-to-abc', text: new TextDecoder('utf-8', { fatal: true }).decode(xml) },
    signal,
  );
  signal?.throwIfAborted();
  if (!output.ok || !output.text) throw Error('Không tạo được ABC. Hãy xuất MXL hoặc MSCZ.');
  const abc = new TextEncoder().encode(output.text);
  if (abc.length > MAX_INPUT_BYTES)
    throw Error('ABC xuất ra vượt 32 MiB, không thể mở lại an toàn. Hãy xuất MXL/MSCZ.');
  const roundtrip = await prepareImport(abc, 'roundtrip.abc', converter, signal);
  signal?.throwIfAborted();
  const after = bridge.semantics(roundtrip.bytes);
  assertAbcFidelity(before, after);
  if (revision !== bridge.revision)
    throw Error('Bản nhạc đã thay đổi trong lúc xuất ABC. Hãy xuất lại để lấy bản mới nhất.');
  return { text: output.text, diagnostics: [...output.diagnostics, ...roundtrip.diagnostics] };
}
