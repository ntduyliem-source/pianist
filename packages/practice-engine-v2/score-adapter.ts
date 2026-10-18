// Data adapter, not a grader. MuseScore supplies repeat traversal and note identity.
// Fixed tempo uses score ticks (480 PPQ); score tempo uses native performed times.
import type {ScoreSnapshot} from '../score-contracts/index';
import {ENGINE_ID, type Hand, type PracticeSettings, type Target, type Timeline} from './model';

export function settingsFor(score: ScoreSnapshot): PracticeSettings {
  const roles: Record<number, Hand> = {};
  score.staves.forEach((staff, i) => {roles[staff.id] = i === 0 ? 'right' : 'left';});
  return {version: 2, mode: 'wait', bpm: Math.round(score.baseQuarterBpm || 60), beatQuarter: 1,
    tempoMode: 'fixed', countIn: 4, metronome: true, fromMeasure: 0, toMeasure: Math.max(0, score.measures.length - 1),
    hand: 'both', roles, voices: [0, 1, 2, 3], loops: 1, loopBpmStep: 0, accompaniment: false,
    difficulty: 5, offsetMs: 0, maxDeliveryMs: 150, inputSource: 'virtual', deviceId: 'virtual'};
}

export function validateSettings(c: PracticeSettings, score: ScoreSnapshot): void {
  const integer = (v: number, lo: number, hi: number) => Number.isInteger(v) && v >= lo && v <= hi;
  if (c.version !== 2 || !['wait', 'bpm'].includes(c.mode) || !['fixed', 'score'].includes(c.tempoMode)
      || !integer(c.fromMeasure, 0, score.measures.length - 1) || !integer(c.toMeasure, c.fromMeasure, score.measures.length - 1)
      || !integer(c.loops, 1, 10) || !integer(c.countIn, 0, 16) || ![.5, 1, 1.5].includes(c.beatQuarter)
      || !Number.isFinite(c.bpm) || c.bpm < 20 || c.bpm > 300 || !Number.isFinite(c.loopBpmStep) || c.loopBpmStep < 0 || c.loopBpmStep > 50
      || c.bpm + (c.loops - 1) * c.loopBpmStep > 300
      || !Number.isFinite(c.offsetMs) || Math.abs(c.offsetMs) > 500 || !integer(c.maxDeliveryMs, 20, 500)
      || ![0, 5, 10].includes(c.difficulty) || !['both', 'left', 'right'].includes(c.hand)
      || !c.voices.length || c.voices.some(v => !integer(v, 0, 3))
      || !['midi', 'virtual'].includes(c.inputSource) || !c.deviceId
      || score.staves.some(s => !['off', 'left', 'right'].includes(c.roles[s.id]))) throw Error('Thiết lập luyện tập không hợp lệ.');
}

export function createTimeline(score: ScoreSnapshot, settings: PracticeSettings): Timeline {
  const c = structuredClone(settings); validateSettings(c, score);
  const measures = new Map(score.measures.map(m => [m.index, m]));
  const anchors = new Map(score.anchors.map(n => [n.id, n]));
  const performed = new Map<number, typeof score.performed>();
  for (const n of score.performed) {
    const group = performed.get(n.occurrence) ?? [];
    group.push(n); performed.set(n.occurrence, group);
  }
  const nativeClicks = new Map<number, typeof score.beats>();
  for (const b of score.beats) {const group = nativeClicks.get(b.occurrence) ?? []; group.push(b); nativeClicks.set(b.occurrence, group);}
  const selected = score.occurrences.filter(o => o.measure >= c.fromMeasure && o.measure <= c.toMeasure);
  if (!selected.length) throw Error('Đoạn đã chọn không có trong lịch phát bản nhạc.');
  const timeline: Timeline = {version: 2, engine: ENGINE_ID, projectId: score.projectId, revision: score.revision,
    fingerprint: score.fingerprint, settings: c, targets: [], groups: [], visits: [], clicks: [], guide: [], durationMs: 0, warnings: [...score.warnings]};
  const all: Target[] = [];
  let origin = 0;
  for (let loop = 0; loop < c.loops; loop++) {
    const bpm = c.bpm + loop * c.loopBpmStep;
    const quarterMs = 60000 / (bpm * c.beatQuarter);
    const tempoScale = score.baseQuarterBpm / (bpm * c.beatQuarter);
    // Only a contiguous native traversal can carry a tie. A cut or new loop reattacks.
    let previousOccurrence: number | undefined;
    const tails = new Map<string, {target: Target; end: number}>();
    for (const occurrence of selected) {
      if (previousOccurrence !== undefined && occurrence.index !== previousOccurrence + 1) tails.clear();
      previousOccurrence = occurrence.index;
      const measure = measures.get(occurrence.measure);
      if (!measure) throw Error('Snapshot thiếu ô nhịp.');
      const lengthQuarter = (measure.endTick - measure.tick) / 480;
      const lengthMs = c.tempoMode === 'fixed' ? lengthQuarter * quarterMs : (occurrence.endMs - occurrence.startMs) * tempoScale;
      if (!(lengthMs > 0) || !Number.isFinite(lengthMs)) throw Error('Lịch thời gian của bản nhạc không hợp lệ.');
      const visit = {id: timeline.visits.length, loop, occurrence: occurrence.index, measure: occurrence.measure, startMs: origin, endMs: origin + lengthMs};
      timeline.visits.push(visit);
      if (c.tempoMode === 'fixed') {
        for (let unit = 0; unit * c.beatQuarter < lengthQuarter - 1e-9; unit++) timeline.clicks.push({atMs: origin + unit * c.beatQuarter * quarterMs, accent: unit === 0});
      } else {
        const beats = (nativeClicks.get(occurrence.index) ?? []).filter(b => (b.beatQuarter ?? 1) === c.beatQuarter);
        if (!beats.length) throw Error('Snapshot thiếu lưới phách từ MuseScore. Hãy tạo lại bản tập.');
        for (const beat of beats) timeline.clicks.push({atMs: origin + (beat.atMs - occurrence.startMs) * tempoScale, accent: beat.accent});
      }
      for (const item of [...performed.get(occurrence.index) ?? []].sort((a, b) => a.atMs - b.atMs || a.anchor.localeCompare(b.anchor))) {
        const note = anchors.get(item.anchor);
        if (!note || !note.play || note.durationTicks <= 0) continue;
        const atMs = origin + (c.tempoMode === 'fixed' ? (note.tick - measure.tick) / 480 * quarterMs : (item.atMs - occurrence.startMs) * tempoScale);
        const endMs = c.tempoMode === 'fixed' ? atMs + note.durationTicks / 480 * quarterMs : origin + (item.endMs - occurrence.startMs) * tempoScale;
        const role = c.roles[note.staff] ?? 'off';
        const span = {anchor: note.id, visit: visit.id, atMs, endMs};
        const prior = note.tieBack ? tails.get(note.tieBack) : undefined;
        if (prior && prior.target.pitch === note.pitch && Math.abs(prior.end - atMs) < 1e-6) {
          prior.target.endMs = Math.max(prior.target.endMs, endMs);
          prior.target.anchors.push(note.id); prior.target.spans.push(span);
          prior.target.roles = [...new Set([...prior.target.roles, role])];
          prior.target.voices = [...new Set([...prior.target.voices, note.voice])];
          tails.set(note.id, {target: prior.target, end: endMs});
        } else {
          const target: Target = {id: `${loop}:${occurrence.index}:${note.id}`, pitch: note.pitch, atMs, endMs,
            measure: note.measure, occurrence: occurrence.index, loop, anchors: [note.id], spans: [span], roles: [role], voices: [note.voice]};
          all.push(target); tails.set(note.id, {target, end: endMs});
        }
      }
      origin = visit.endMs;
    }
    if (loop < c.loops - 1) origin += 60000 / bpm;
  }
  const physical = new Map<string, Target>();
  for (const note of all) {
    const identity = `${note.loop}/${note.atMs}/${note.pitch}`;
    const prior = physical.get(identity);
    if (!prior) physical.set(identity, note);
    else {
      prior.endMs = Math.max(prior.endMs, note.endMs); prior.anchors.push(...note.anchors); prior.spans.push(...note.spans);
      prior.roles = [...new Set([...prior.roles, ...note.roles])]; prior.voices = [...new Set([...prior.voices, ...note.voices])];
    }
  }
  // A voice and a hand must belong to the SAME written note. A physical unison
  // can merge anchors from two staves with different roles/voices.
  const voiceSelected = (t: Target) => t.anchors.some(id => c.voices.includes(anchors.get(id)!.voice));
  const handSelected = (t: Target) => t.anchors.some(id => {
    const a = anchors.get(id)!, r = c.roles[a.staff];
    return c.voices.includes(a.voice) && r !== 'off' && (c.hand === 'both' || r === c.hand);
  });
  const targets = [...physical.values()].sort((a, b) => a.atMs - b.atMs || a.pitch - b.pitch);
  timeline.targets = targets.filter(t => voiceSelected(t) && handSelected(t));
  if (!timeline.targets.length) throw Error('Đoạn này không có nốt cho tay/bè đã chọn.');
  if (c.accompaniment && c.mode === 'bpm' && c.hand !== 'both') timeline.guide = targets.filter(t => voiceSelected(t) && !handSelected(t) && t.roles.some(r => r !== 'off'));
  timeline.durationMs = origin;
  if (timeline.targets.length > 100000 || origin > 7200000) throw Error('Chọn đoạn ngắn hơn: tối đa 100.000 nốt và 2 giờ.');
  for (const target of timeline.targets) {
    target.endMs = Math.min(target.endMs, origin);
    const group = timeline.groups.at(-1);
    if (group && group.atMs === target.atMs) group.ids.push(target.id);
    else timeline.groups.push({atMs: target.atMs, ids: [target.id]});
  }
  return timeline;
}
