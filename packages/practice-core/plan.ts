import { ALGORITHM_VERSION, type Attack, type Plan, type ScoreSnapshot, type SessionConfig } from '../score-contracts/index';

export function defaultConfig(snapshot: ScoreSnapshot): SessionConfig {
  const roles: SessionConfig['roles'] = {};
  const parts = new Map<string, number>();
  for (const s of snapshot.staves) {
    const index = parts.get(s.partId) ?? 0; parts.set(s.partId, index + 1);
    roles[s.id] = index === 0 ? 'right' : 'left';
  }
  return {mode: 'wait', bpm: Math.round(snapshot.baseQuarterBpm || 80), beatQuarter: 1, countIn: 4, metronome: true,
    fromMeasure: 0, toMeasure: Math.max(0, snapshot.measures.length - 1), hand: 'both', roles, voices: [0, 1, 2, 3],
    loops: 1, offsetMs: 0, perfectMs: 50, goodMs: 120, windowMs: 250, deliveryMs: 120,
    inputSource: 'virtual', deviceId: 'virtual', algorithmVersion: ALGORITHM_VERSION, accompaniment: false, releaseMode: 'off', arpeggioMs: 0};
}

export function buildPlan(snapshot: ScoreSnapshot, input: SessionConfig): Plan {
  const config = structuredClone(input);
  if (!['off', 'key', 'sustain'].includes(config.releaseMode ?? 'off') || ![0, 80, 120, 200].includes(config.arpeggioMs ?? 0)) throw Error('Profile giữ phím/arpeggio không hợp lệ.');
  if (config.mode === 'wait') {config.releaseMode = 'off'; config.arpeggioMs = 0;}
  if (snapshot.schemaVersion !== 1 || !Number.isFinite(snapshot.baseQuarterBpm) || snapshot.baseQuarterBpm <= 0) throw Error('Snapshot/tempo không hợp lệ.');
  if (config.algorithmVersion !== ALGORITHM_VERSION || !['wait', 'bpm'].includes(config.mode)) throw Error('Phiên bản bộ chấm không tương thích.');
  if (![config.bpm, config.offsetMs, config.perfectMs, config.goodMs, config.windowMs, config.deliveryMs, config.countIn].every(Number.isFinite)
    || ![config.fromMeasure, config.toMeasure, config.countIn].every(Number.isInteger)
    || !config.voices.length || config.voices.some(v => !Number.isInteger(v) || v < 0 || v > 3)) throw Error('Tempo, timing hoặc voice không hợp lệ.');
  if (!(config.bpm >= 20 && config.bpm <= 300) || ![0.5, 1, 1.5].includes(config.beatQuarter)
    || !Number.isInteger(config.loops) || config.loops < 1 || config.loops > 10 || config.fromMeasure > config.toMeasure
    || config.fromMeasure < 0 || config.toMeasure >= snapshot.measures.length || !Number.isFinite(config.offsetMs) || Math.abs(config.offsetMs) > 500
    || config.perfectMs < 0 || config.goodMs < config.perfectMs || config.windowMs < config.goodMs || config.windowMs > 300
    || config.deliveryMs < 0 || config.deliveryMs > 500 || config.countIn < 0 || config.countIn > 8) throw Error('Cấu hình tập nằm ngoài giới hạn.');
  const step = config.mode === 'bpm' ? config.loopBpmStep ?? 0 : 0;
  const lastBpm = config.bpm + (config.loops - 1) * step;
  if (!Number.isInteger(step) || Math.abs(step) > 20 || lastBpm < 20 || lastBpm > 300) throw Error('BPM từng lượt phải nằm trong 20–300, mức đổi tối đa 20 BPM/lượt.');
  const anchors = new Map(snapshot.anchors.map(a => [a.id, a]));
  const notesByOccurrence = new Map<number, typeof snapshot.performed>();
  for (const p of snapshot.performed) {
    const list = notesByOccurrence.get(p.occurrence) ?? []; list.push(p); notesByOccurrence.set(p.occurrence, list);
  }
  const selected = snapshot.occurrences.filter(o => o.measure >= config.fromMeasure && o.measure <= config.toMeasure);
  const targets: Attack[] = [], beats: Plan['beats'] = [], loops: Plan['loops'] = [], visits: NonNullable<Plan['visits']> = [];
  let cursor = 0, pass = -1;
  for (let loop = 0; loop < config.loops; ++loop) {
    const bpm = config.bpm + loop * step, scale = snapshot.baseQuarterBpm / (bpm * config.beatQuarter);
    const startMs = cursor;
    // Tie chains follow the *performed* path, and only merge when contiguous.
    const tails = new Map<string, {target: Attack; endMs: number}>();
    for (const o of selected) {
      const from = cursor;
      const length = (o.endMs - o.startMs) * scale;
      if (!Number.isFinite(length) || length <= 0) throw Error('Ô nhịp có thời lượng không hợp lệ.');
      const previous = visits.at(-1);
      if (!previous || previous.loop !== loop || o.measure <= previous.measure) ++pass;
      visits.push({measure: o.measure, occurrence: o.index, loop, pass, startMs: from, endMs: from + length});
      for (const p of notesByOccurrence.get(o.index) ?? []) {
        const a = anchors.get(p.anchor); if (!a) throw Error('Snapshot thiếu score anchor.');
        const role = config.roles[a.staff] ?? 'off';
        if (role === 'off' || !config.voices.includes(a.voice) || (config.hand !== 'both' && config.hand !== role)) continue;
        const atMs = from + (p.atMs - o.startMs) * scale;
        const endMs = from + (p.endMs - o.startMs) * scale;
        if (!Number.isFinite(atMs) || !Number.isFinite(endMs) || endMs < atMs || a.pitch < 0 || a.pitch > 127) throw Error('Mục tiêu nốt không hợp lệ.');
        const tail = a.tieBack ? tails.get(a.tieBack) : undefined;
        if (tail && tail.target.pitch === a.pitch && Math.abs(tail.endMs - atMs) < 0.1) {
          tail.target.endMs = Math.max(tail.target.endMs, endMs);
          tail.target.releaseRatio = 1; tail.target.releaseUnsupported ||= a.releaseUnsupported;
          tail.target.anchors.push(a.id);
          tail.target.spans!.push({anchor: a.id, occurrence: o.index, atMs, endMs});
          if (!tail.target.roles.includes(role)) tail.target.roles.push(role);
          tails.set(a.id, {target: tail.target, endMs});
        } else {
          const attack: Attack = {id: `l${loop}-o${o.index}-${a.id}`, pitch: a.pitch, atMs, endMs,
            anchors: [a.id], roles: [role], measure: a.measure, occurrence: o.index, loop, spans: [{anchor: a.id, occurrence: o.index, atMs, endMs}],
            releaseRatio: a.releaseRatio ?? 1, releaseUnsupported: a.releaseUnsupported};
          targets.push(attack); tails.set(a.id, {target: attack, endMs});
        }
      }
      const scoreBeats = snapshot.beats.filter(b => b.occurrence === o.index);
      const exactBeats = scoreBeats.filter(b => b.beatQuarter === config.beatQuarter);
      // Explicit beat unit: quarter / eighth / dotted quarter, independent of notation edits.
      const measure = snapshot.measures[o.measure];
      const quarterLength = (measure.endTick - measure.tick) / 480;
      if (exactBeats.length) {
        beats.push(...exactBeats.map(b => ({atMs: from + (b.atMs - o.startMs) * scale, accent: b.accent})));
      }
      for (let q = 0; !exactBeats.length && q < quarterLength - 1e-7; q += config.beatQuarter) {
        // Interpolate within the engine's beat map so tempo changes keep their timing.
        const tickFraction = q / quarterLength;
        const denQuarter = 4 / measure.denominator;
        const i = Math.min(Math.floor(q / denQuarter), Math.max(0, scoreBeats.length - 1));
        const b0 = scoreBeats[i]?.atMs ?? o.startMs;
        const b1 = scoreBeats[i + 1]?.atMs ?? o.endMs;
        const part = scoreBeats.length ? Math.min(1, (q - i * denQuarter) / denQuarter) : tickFraction;
        beats.push({atMs: from + (b0 + (b1 - b0) * part - o.startMs) * scale, accent: q === 0});
      }
      cursor += length;
    }
    loops.push({index: loop, startMs, endMs: cursor, bpm});
    if (loop + 1 < config.loops) cursor += 60000 / bpm; // one beat at the preceding loop tempo
  }
  targets.sort((a, b) => a.atMs - b.atMs || a.pitch - b.pitch || a.id.localeCompare(b.id));
  const merged: Attack[] = [];
  for (const t of targets) {
    const last = merged.at(-1);
    if (last && last.pitch === t.pitch && Math.abs(last.atMs - t.atMs) < 0.01 && last.loop === t.loop) {
      const releaseMs = Math.max((last.endMs - last.atMs) * (last.releaseRatio ?? 1), (t.endMs - t.atMs) * (t.releaseRatio ?? 1));
      last.anchors.push(...t.anchors); last.roles = [...new Set([...last.roles, ...t.roles])]; last.endMs = Math.max(last.endMs, t.endMs);
      last.spans!.push(...t.spans!);
      last.releaseRatio = last.endMs > last.atMs ? releaseMs / (last.endMs - last.atMs) : 1; last.releaseUnsupported ||= t.releaseUnsupported;
    } else merged.push(t);
  }
  if (config.arpeggioMs) {
    const rolls = new Map<string, {direction: 'up' | 'down'; targets: Attack[]}>();
    for (const target of merged) {
      const a = anchors.get(target.anchors[0]); if (!a?.arpeggio || !a.arpeggioGroup) continue;
      const key = `${target.loop}/${target.occurrence}/${a.arpeggioGroup}`;
      const roll = rolls.get(key) ?? {direction: a.arpeggio, targets: []}; roll.targets.push(target); rolls.set(key, roll);
    }
    for (const roll of rolls.values()) {
      roll.targets.sort((a, b) => roll.direction === 'up' ? a.pitch - b.pitch : b.pitch - a.pitch);
      const spread = Math.min(config.arpeggioMs, ...roll.targets.map(t => (t.endMs - t.atMs) / 2));
      roll.targets.forEach((target, i) => {target.atMs += roll.targets.length > 1 ? i * spread / (roll.targets.length - 1) : 0;});
    }
    merged.sort((a, b) => a.atMs - b.atMs || a.pitch - b.pitch);
  }
  if (!merged.length) throw Error('Đoạn này không có nốt cho tay/bè đã chọn. Hãy nhập bài hoặc chọn đoạn khác.');
  if (merged.length > 100000 || cursor > 2 * 60 * 60 * 1000) throw Error('Bài/loop vượt giới hạn 100.000 nốt hoặc 2 giờ.');
  const groups: Plan['groups'] = [];
  for (const t of merged) {
    const g = groups.at(-1);
    if (g && Math.abs(g.atMs - t.atMs) < 0.01) { g.targets.push(t); g.endMs = Math.max(g.endMs, t.endMs); }
    else groups.push({atMs: t.atMs, endMs: t.endMs, targets: [t]});
  }
  let accompaniment: Attack[] = [];
  if (config.accompaniment && config.mode === 'bpm' && config.hand !== 'both') {
    const otherHand = config.hand === 'left' ? 'right' : 'left';
    const selectedIndices = new Set(selected.map(o => o.index));
    if (snapshot.performed.some(p => {const a = anchors.get(p.anchor); return selectedIndices.has(p.occurrence) && a && config.roles[a.staff] === otherHand && config.voices.includes(a.voice);})) {
      const guide = buildPlan(snapshot, {...config, hand: otherHand, accompaniment: false});
      const practiced = new Set(merged.map(t => `${t.loop}/${t.atMs.toFixed(2)}/${t.pitch}`));
      accompaniment = guide.targets.filter(t => !practiced.has(`${t.loop}/${t.atMs.toFixed(2)}/${t.pitch}`));
    }
  }
  return {schemaVersion: 1, projectId: snapshot.projectId, revision: snapshot.revision, fingerprint: snapshot.fingerprint,
    targets: merged, durationMs: cursor, config, beats, groups, loops, visits, accompaniment};
}
