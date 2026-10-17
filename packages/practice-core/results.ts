import type { CoreState, Plan, SessionResult } from '../score-contracts/index';

export function resultCsv(result: SessionResult): string {
  const targets = new Map(result.targets.map(t => [t.id, t])), releases = new Map(result.releases?.map(r => [r.targetId, r]));
  const rows: (string | number)[][] = [['target', 'loop', 'measure', 'pitch', 'status', 'delta_ms', 'grade', 'release_mode', 'release_status', 'expected_hold_ms', 'held_ms', 'release_delta_ms', 'event_seq']];
  for (const a of [...result.assessments].sort((a, b) => a.atMs - b.atMs)) {
    const t = targets.get(a.targetId), r = releases.get(a.targetId);
    rows.push([a.targetId, t ? t.loop + 1 : '', t ? t.measure + 1 : '', t?.pitch ?? '', a.status, a.deltaMs ?? '', a.grade ?? '', result.config.releaseMode ?? 'off', r?.status ?? '', r?.expectedMs ?? '', r?.heldMs ?? '', r?.deltaMs ?? '', a.eventSeq ?? '']);
  }
  for (const e of result.extraEvents) rows.push(['', e.loop === undefined ? '' : e.loop + 1, e.measure === undefined ? '' : e.measure + 1, e.pitch, 'extra', '', '', '', '', '', '', '', e.seq]);
  const cell = (value: string | number) => {
    let text = String(value);
    // Imported backups may contain arbitrary identifiers. Keep spreadsheet
    // formula prefixes inert while retaining numeric timing values as numbers.
    if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  };
  return '\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}

export function summarize(plan: Plan, state: CoreState, title: string, outcome: SessionResult['outcome'], elapsedMs: number, clock: string): SessionResult {
  const matched = state.assessments.filter(a => a.status === 'matched');
  const deltas = matched.flatMap(a => a.deltaMs === undefined ? [] : [a.deltaMs]);
  const absolute = deltas.map(Math.abs).sort((a, b) => a - b);
  const quantile = (q: number) => absolute.length ? absolute[Math.min(absolute.length - 1, Math.ceil(q * absolute.length) - 1)] : null;
  const good = matched.filter(a => a.grade === 'perfect' || a.grade === 'good').length;
  const assessments = new Map(state.assessments.map(a => [a.targetId, a]));
  const releases = state.releases ?? [], scoredReleases = releases.filter(r => !['interrupted', 'unscored'].includes(r.status));
  const weak = new Map<number, {measure: number; missed: number; badTiming: number; evaluated: number; extras: number}>();
  for (const t of plan.targets) {
    const a = assessments.get(t.id); if (!a) continue;
    const m = weak.get(t.measure) ?? {measure: t.measure, missed: 0, badTiming: 0, evaluated: 0, extras: 0};
    ++m.evaluated; if (a.status === 'missed') ++m.missed; if (a.grade === 'outside') ++m.badTiming; weak.set(t.measure, m);
  }
  for (const extra of state.extras) {
    if (extra.measure === undefined) continue;
    const m = weak.get(extra.measure) ?? {measure: extra.measure, missed: 0, badTiming: 0, evaluated: 0, extras: 0};
    ++m.extras; weak.set(m.measure, m);
  }
  return {id: crypto.randomUUID(), schemaVersion: 1, createdAt: Date.now(), projectId: plan.projectId, revision: plan.revision,
    fingerprint: plan.fingerprint, title, config: structuredClone(plan.config), outcome, elapsedMs, planned: plan.targets.length,
    evaluated: state.assessments.length, matched: matched.length, missed: state.assessments.length - matched.length,
    extras: state.extras.length, good, coverage: state.assessments.length ? matched.length / state.assessments.length : null,
    precision: matched.length + state.extras.length ? matched.length / (matched.length + state.extras.length) : null,
    timingRate: state.assessments.length && plan.config.mode === 'bpm' ? good / state.assessments.length : null,
    medianAbsMs: absolute.length ? (absolute[Math.floor((absolute.length - 1) / 2)] + absolute[Math.floor(absolute.length / 2)]) / 2 : null,
    p90AbsMs: quantile(.9), signedMeanMs: deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null,
    firstTry: state.firstTry, groupsDone: state.groupsDone, corrections: state.corrections,
    assessments: [...state.assessments].sort((a, b) => a.atMs - b.atMs || a.targetId.localeCompare(b.targetId)),
    extraEvents: [...state.extras].sort((a, b) => a.seq - b.seq), targets: plan.targets,
    chords: plan.groups.filter(g => g.targets.length > 1).map(g => {
      const hits = g.targets.map(t => assessments.get(t.id));
      const times = hits.flatMap(a => a?.performedAtMs !== undefined ? [a.performedAtMs] : a?.deltaMs !== undefined ? [a.deltaMs] : []);
      return {ids: g.targets.map(t => t.id), complete: hits.every(a => a?.status === 'matched'),
        spreadMs: times.length === g.targets.length ? Math.max(...times) - Math.min(...times) : null};
    }), weakMeasures: [...weak.values()].sort((a, b) => b.missed + b.badTiming + b.extras - a.missed - a.badTiming - a.extras || a.measure - b.measure),
    perLoop: plan.loops.map(l => {
      const ids = new Set(plan.targets.filter(t => t.loop === l.index).map(t => t.id));
      const evaluated = state.assessments.filter(a => ids.has(a.targetId));
      return {loop: l.index, evaluated: evaluated.length, matched: evaluated.filter(a => a.status === 'matched').length,
        extras: state.extras.filter(e => e.loop !== undefined ? e.loop === l.index : e.atMs >= l.startMs && e.atMs <= l.endMs).length};
    }), faults: state.faults, clock,
    ...(plan.config.mode === 'bpm' && plan.config.releaseMode && plan.config.releaseMode !== 'off'
      ? {releases: [...releases].sort((a, b) => a.targetId.localeCompare(b.targetId)), releaseRate: scoredReleases.length ? scoredReleases.filter(r => r.status === 'good').length / scoredReleases.length : null} : {})};
}
