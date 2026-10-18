import {BASE_SCORE, type Grade} from './upstream/mania';
import {ENGINE_ID, type AttemptResult, type EngineView, type ReplayCommand, type Timeline} from './model';
import {PracticeEngine} from './engine';
import {assessReleases} from './release-assessment';

export function resultFor(timeline: Timeline, view: EngineView, title: string, outcome: AttemptResult['outcome'], elapsedMs: number): AttemptResult {
  const grades: Record<Grade, number> = {miss: 0, meh: 0, ok: 0, good: 0, great: 0, perfect: 0};
  for (const j of view.judgements) grades[j.grade]++;
  const count = view.judgements.length, misses = grades.miss, hits = count - misses;
  const inputs=view.judgements.filter(j=>j.seq!==null).length+view.extras.length;
  const hitDeltas = view.judgements.filter(j => j.seq !== null && j.grade !== 'miss').map(j => j.delta);
  const absolute = hitDeltas.map(Math.abs).sort((a, b) => a - b);
  const center = absolute.length ? (absolute[Math.floor((absolute.length - 1) / 2)] + absolute[Math.floor(absolute.length / 2)]) / 2 : null;
  const bpm = timeline.settings.mode === 'bpm';
  return {id: crypto.randomUUID(), schemaVersion: 2, engine: ENGINE_ID, createdAt: Date.now(),
    projectId: timeline.projectId, revision: timeline.revision, fingerprint: timeline.fingerprint,
    title, settings: structuredClone(timeline.settings), outcome, elapsedMs,
    timeline: structuredClone(timeline), judgements: structuredClone(view.judgements), extras: structuredClone(view.extras),
    intervals: structuredClone(view.intervals), pedalIntervals:structuredClone(view.pedalIntervals??[]),controls:structuredClone(view.controls??[]),
    r4:assessReleases(timeline,view,outcome),faults: [...view.faults], metrics: {
      planned: timeline.targets.length, evaluated: count, hits, misses, extras: view.extras.length,inputs,
      // osu!mania's base-score accuracy. Extras are reported separately: upstream
      // accuracy does NOT penalise key presses that hit no object. No hidden score.
      accuracy: bpm && count ? view.judgements.reduce((sum, j) => sum + BASE_SCORE[j.grade], 0) / (305 * count) : null,
      coverage: count ? hits / count : null, precision: inputs ? hits / inputs : null,
      medianAbsMs: bpm ? center : null, p90AbsMs: bpm && absolute.length ? absolute[Math.ceil(.9 * absolute.length) - 1] : null,
      signedMeanMs: bpm && hitDeltas.length ? hitDeltas.reduce((a, b) => a + b, 0) / hitDeltas.length : null, grades,
    }};
}

export function replayAttempt(timeline: Timeline, commands: readonly ReplayCommand[]): EngineView {
  if (timeline.engine !== ENGINE_ID) throw Error('Bản ghi này thuộc bộ chấm khác; bản mới chỉ đọc kết quả đã lưu.');
  const engine = new PracticeEngine(timeline);
  for (const command of commands) engine.command(command);
  return engine.view();
}

export function canCompare(a: AttemptResult, b: AttemptResult): boolean {
  if(a.simulation||b.simulation)return false;
  if(a.r4?.pedal.status==='partial'||b.r4?.pedal.status==='partial'||a.r4?.key.some(n=>n.status==='interrupted')||b.r4?.key.some(n=>n.status==='interrupted'))return false;
  if (a.engine !== b.engine || a.fingerprint !== b.fingerprint || a.outcome !== 'complete' || b.outcome !== 'complete') return false;
  // Missing or mixed clock provenance is not a comparable timing measurement.
  const clockSources=(r:AttemptResult)=>new Set(r.clock?.segments.map(s=>s.source));
  const ac=clockSources(a),bc=clockSources(b);
  if(ac.size!==1||bc.size!==1||[...ac][0]!==[...bc][0])return false;
  // Every timing and attribution setting affects comparability; port id is retained
  // because calibration and MIDI delivery are part of the measurement conditions.
  return JSON.stringify(a.settings) === JSON.stringify(b.settings);
}

export function attemptCsv(result: AttemptResult): string {
  const quote = (value: unknown) => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  const targets = new Map(result.timeline.targets.map(t => [t.id, t]));
  const release=new Map(result.r4?.key.map(n=>[n.id,n])),sound=new Map(result.r4?.sound.map(n=>[n.id,n]));
  const lines = [['target', 'measure', 'loop', 'pitch', 'grade', 'offset_ms', 'event', 'engine','release_status','release_expected_ms','release_actual_ms','release_delta_ms','release_tolerance_ms','sustain_status','sustain_delta_ms','pedal_enabled']];
  for (const j of result.judgements) {
    const t = targets.get(j.id)!;
    lines.push([j.id, String(t.measure + 1), String(t.loop + 1), String(t.pitch), result.settings.mode === 'wait' ? 'hit' : j.grade,
      j.seq === null || result.settings.mode === 'wait' ? '' : String(j.delta), String(j.seq ?? ''), result.engine,
      release.get(j.id)?.status??'',String(release.get(j.id)?.expectedMs??''),String(release.get(j.id)?.actualMs??''),String(release.get(j.id)?.deltaMs??''),String(release.get(j.id)?.toleranceMs??''),
      sound.get(j.id)?.status??'',String(sound.get(j.id)?.deltaMs??''),String(result.settings.pedalEnabled!==false)]);
  }
  return '\uFEFF' + lines.map(row => row.map(quote).join(',')).join('\r\n');
}
