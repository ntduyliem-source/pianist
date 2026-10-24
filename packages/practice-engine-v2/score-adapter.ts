// Data adapter, not a grader. MuseScore supplies repeat traversal and note identity.
// Fixed tempo uses score ticks (480 PPQ); score tempo uses native performed times.
import type {ScoreSnapshot} from '../score-contracts/index';
import {ENGINE_ID, type Hand, type PracticeSettings, type Target, type Timeline} from './model';
import {attachReleaseReferences} from './reference-adapter-r4';
import {nativePerformanceTargets} from './native-performance';
import {nativeVisitClock} from './native-time';

export function settingsFor(score: ScoreSnapshot): PracticeSettings {
  const roles: Record<number, Hand> = {};
  score.staves.forEach((staff, i) => {roles[staff.id] = i === 0 ? 'right' : 'left';});
  return {version: 2, mode: 'wait', bpm: Math.round(score.baseQuarterBpm || 60), beatQuarter: 1,
    tempoMode: 'fixed', countIn: 4, metronome: true, fromMeasure: 0, toMeasure: Math.max(0, score.measures.length - 1),
    hand: 'both', roles, voices: [0, 1, 2, 3], loops: 1, loopBpmStep: 0, accompaniment: false,
    difficulty: 5, offsetMs: 0, maxDeliveryMs: 150, inputSource: 'virtual', deviceId: 'virtual',durationEnabled:true,pedalEnabled:true};
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
      || c.durationEnabled!==undefined&&typeof c.durationEnabled!=='boolean' || c.pedalEnabled!==undefined&&typeof c.pedalEnabled!=='boolean'
      || score.staves.some(s => !['off', 'left', 'right'].includes(c.roles[s.id]))) throw Error('Thiết lập luyện tập không hợp lệ.');
}

export function createTimeline(score: ScoreSnapshot, settings: PracticeSettings): Timeline {
  const c = structuredClone(settings); validateSettings(c, score);
  if(c.mode==='bpm'&&!score.performance){
    const selectedWritten=(measure:number,staff?:number,voice?:number)=>measure>=c.fromMeasure&&measure<=c.toMeasure
      &&(voice===undefined||c.voices.includes(voice))&&(staff===undefined||c.roles[staff]!=='off'&&(c.hand==='both'||c.roles[staff]===c.hand||c.accompaniment));
    const unsupported=score.unsupported?.filter(n=>selectedWritten(n.measure,n.staff,n.voice)
      &&(n.kind!=='pause'||c.tempoMode==='score')).map(n=>n.kind)??[];
    if(score.unsupported===undefined){
      // Older cached snapshots lack per-segment provenance. Never silently
      // award timing grades for musical events this adapter cannot represent.
      if(score.anchors.some(n=>n.arpeggio&&selectedWritten(n.measure,n.staff,n.voice)))unsupported.push('arpeggio');
      for(const kind of ['ornament','grace'] as const)if(score.warnings.includes(kind))unsupported.push(kind);
      if(c.tempoMode==='score'&&score.warnings.includes('pause'))unsupported.push('pause');
    }
    if(unsupported.length){
      const labels:Record<string,string>={arpeggio:'rải hợp âm',ornament:'nốt hoa mỹ',grace:'nốt luyến nhỏ',pause:'nghỉ có thời lượng riêng'};
      throw Error(`Bản tập lưu cũ chưa có lịch MuseScore cho ${[...new Set(unsupported)].map(k=>labels[k]??k).join(', ')}. Mở lại bài để cập nhật bản tập.`);
    }
  }
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
    fingerprint: score.fingerprint, settings: c, targets: [], groups: [], visits: [], clicks: [], guide: [], tempos: [], timeMap: [], durationMs: 0, warnings: [...score.warnings]};
  const all: Target[] = [], guide: Target[] = [];
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
      const clock=nativeVisitClock(score,c,occurrence,loop);
      const lengthMs = clock.lengthMs;
      if (!(lengthMs > 0) || !Number.isFinite(lengthMs)) throw Error('Lịch thời gian của bản nhạc không hợp lệ.');
      const visit = {id: timeline.visits.length, loop, occurrence: occurrence.index, measure: occurrence.measure, startMs: origin, endMs: origin + lengthMs};
      timeline.visits.push(visit);
      for(const point of clock.points)timeline.timeMap!.push({visit:visit.id,tick:point.tick,atMs:origin+point.elapsed});
      if(c.tempoMode==='fixed')timeline.tempos!.push({atMs:origin,bpm});
      else{
        const tempos=score.tempos?.filter(p=>p.occurrence===occurrence.index)??[];
        // Native snapshots include the tempo at every occurrence start, not
        // just explicit marks, so cuts and repeats retain their actual tempo.
        for(const p of tempos)timeline.tempos!.push({atMs:origin+clock.at(p.atMs),bpm:p.quarterBpm/tempoScale/c.beatQuarter});
      }
      if (c.tempoMode === 'fixed') {
        for (let unit = 0; unit * c.beatQuarter < lengthQuarter - 1e-9; unit++) timeline.clicks.push({atMs: origin + unit * c.beatQuarter * quarterMs, accent: unit === 0});
      } else {
        const beats = (nativeClicks.get(occurrence.index) ?? []).filter(b => (b.beatQuarter ?? 1) === c.beatQuarter);
        if (!beats.length) throw Error('Snapshot thiếu lưới phách từ MuseScore. Hãy tạo lại bản tập.');
        for (const beat of beats) timeline.clicks.push({atMs: origin + clock.at(beat.atMs), accent: beat.accent});
      }
      for (const item of (score.performance?[]:[...performed.get(occurrence.index) ?? []]).sort((a, b) => a.atMs - b.atMs || a.anchor.localeCompare(b.anchor))) {
        const note = anchors.get(item.anchor);
        if (!note || !note.play || note.durationTicks <= 0) continue;
        const role = c.roles[note.staff] ?? 'off';
        if (!c.voices.includes(note.voice) || role === 'off') continue;
        const selectedHand = c.hand === 'both' || role === c.hand;
        if (!selectedHand && !(c.accompaniment && c.mode === 'bpm')) continue;
        // Filter written notes before tying/merging physical keys. Unselected
        // voices or hands must not extend the selected note's release reference.
        const lane = selectedHand ? 'target:' : 'guide:';
        const atMs = origin + (c.tempoMode === 'fixed' ? (note.tick - measure.tick) / 480 * quarterMs : (item.atMs - occurrence.startMs) * tempoScale);
        const endMs = c.tempoMode === 'fixed' ? atMs + note.durationTicks / 480 * quarterMs : origin + (item.endMs - occurrence.startMs) * tempoScale;
        const span = {anchor: note.id, visit: visit.id, atMs, endMs};
        const prior = note.tieBack ? tails.get(lane + note.tieBack) : undefined;
        if (prior && prior.target.pitch === note.pitch && Math.abs(prior.end - atMs) < 1e-6) {
          prior.target.endMs = Math.max(prior.target.endMs, endMs);
          prior.target.anchors.push(note.id); prior.target.spans.push(span);
          prior.target.roles = [...new Set([...prior.target.roles, role])];
          prior.target.voices = [...new Set([...prior.target.voices, note.voice])];
          tails.set(lane + note.id, {target: prior.target, end: endMs});
        } else {
          const target: Target = {id: `${loop}:${occurrence.index}:${note.id}`, pitch: note.pitch, atMs, endMs,
            measure: note.measure, occurrence: occurrence.index, loop, anchors: [note.id], spans: [span], roles: [role], voices: [note.voice]};
          (selectedHand ? all : guide).push(target); tails.set(lane + note.id, {target, end: endMs});
        }
      }
      origin = visit.endMs;
    }
    if (loop < c.loops - 1) origin += 60000 / bpm;
  }
  if(score.performance){const native=nativePerformanceTargets(score,timeline);all.push(...native.targets);guide.push(...native.guide);}
  const identity = (note: Target) => `${note.loop}/${note.atMs}/${note.pitch}`;
  const merge = (notes: Target[]) => {
    const physical = new Map<string, Target>();
    for (const note of notes) {
      const key = identity(note), prior = physical.get(key);
      if (!prior) physical.set(key, note);
      else {
        prior.endMs = Math.max(prior.endMs, note.endMs); prior.anchors.push(...note.anchors); prior.spans.push(...note.spans);
        if(note.releaseMs!==undefined)prior.releaseMs=Math.max(prior.releaseMs??0,note.releaseMs);
        prior.roles = [...new Set([...prior.roles, ...note.roles])]; prior.voices = [...new Set([...prior.voices, ...note.voices])];
      }
    }
    return [...physical.values()].sort((a, b) => a.atMs - b.atMs || a.pitch - b.pitch);
  };
  timeline.targets = merge(all);
  if (!timeline.targets.length) throw Error('Đoạn này không có nốt cho tay/bè đã chọn.');
  const played = new Set(timeline.targets.map(identity));
  timeline.guide = merge(guide).filter(n => !played.has(identity(n)));
  timeline.durationMs = origin;
  if (timeline.targets.length > 100000 || origin > 7200000) throw Error('Chọn đoạn ngắn hơn: tối đa 100.000 nốt và 2 giờ.');
  for (const target of timeline.targets) {
    target.endMs = Math.min(target.endMs, origin);
    const group = timeline.groups.at(-1);
    if (group && group.atMs === target.atMs) group.ids.push(target.id);
    else timeline.groups.push({atMs: target.atMs, ids: [target.id]});
  }
  attachReleaseReferences(score,timeline);
  if(score.performance){
    // MPE preserves independent voices. A physical piano key cannot remain
    // held while the same key is struck again. Keep both native attacks and
    // their sounding spans, but do not certify an impossible key-hold offset.
    // No replacement duration or tolerance is invented for these conflicts.
    const nextAttack=new Map<number,number>();
    for(const target of [...timeline.targets].reverse()){
      const next=nextAttack.get(target.pitch);
      if(next!==undefined&&target.releaseMs!==undefined&&target.releaseMs>next)target.releaseMs=undefined;
      nextAttack.set(target.pitch,target.atMs);
    }
  }
  if(timeline.guide.length)attachReleaseReferences(score,{...timeline,targets:timeline.guide});
  return timeline;
}
