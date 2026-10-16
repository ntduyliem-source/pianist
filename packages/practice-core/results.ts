import type { CoreState, Plan, SessionResult } from '../score-contracts/index';

export function summarize(plan: Plan, state: CoreState, title: string, outcome: SessionResult['outcome'], elapsedMs: number, clock: string): SessionResult {
  const matched = state.assessments.filter(a => a.status === 'matched');
  const deltas = matched.flatMap(a => a.deltaMs === undefined ? [] : [a.deltaMs]);
  const absolute = deltas.map(Math.abs).sort((a, b) => a - b);
  const quantile = (q: number) => absolute.length ? absolute[Math.min(absolute.length - 1, Math.ceil(q * absolute.length) - 1)] : null;
  const good = matched.filter(a => a.grade === 'perfect' || a.grade === 'good').length;
  const assessments = new Map(state.assessments.map(a => [a.targetId, a]));
  const weak = new Map<number, {measure: number; missed: number; badTiming: number; evaluated: number}>();
  for (const t of plan.targets) {
    const a = assessments.get(t.id); if (!a) continue;
    const m = weak.get(t.measure) ?? {measure: t.measure, missed: 0, badTiming: 0, evaluated: 0};
    ++m.evaluated; if (a.status === 'missed') ++m.missed; if (a.grade === 'outside') ++m.badTiming; weak.set(t.measure, m);
  }
  return {id: crypto.randomUUID(), schemaVersion: 1, createdAt: Date.now(), projectId: plan.projectId, revision: plan.revision,
    fingerprint: plan.fingerprint, title, config: structuredClone(plan.config), outcome, elapsedMs, planned: plan.targets.length,
    evaluated: state.assessments.length, matched: matched.length, missed: state.assessments.length - matched.length,
    extras: state.extras.length, good, coverage: state.assessments.length ? matched.length / state.assessments.length : 0,
    precision: matched.length + state.extras.length ? matched.length / (matched.length + state.extras.length) : 0,
    timingRate: state.assessments.length ? good / state.assessments.length : 0,
    medianAbsMs: quantile(.5), p90AbsMs: quantile(.9), signedMeanMs: deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null,
    firstTry: state.firstTry, groupsDone: state.groupsDone, corrections: state.corrections,
    assessments: [...state.assessments].sort((a, b) => a.atMs - b.atMs || a.targetId.localeCompare(b.targetId)),
    extraEvents: [...state.extras].sort((a, b) => a.seq - b.seq), targets: plan.targets,
    chords: plan.groups.filter(g => g.targets.length > 1).map(g => {
      const hits = g.targets.map(t => assessments.get(t.id));
      const times = hits.flatMap(a => a?.deltaMs === undefined ? [] : [a.deltaMs]);
      return {ids: g.targets.map(t => t.id), complete: hits.every(a => a?.status === 'matched'),
        spreadMs: times.length === g.targets.length ? Math.max(...times) - Math.min(...times) : null};
    }), weakMeasures: [...weak.values()].sort((a, b) => b.missed + b.badTiming - a.missed - a.badTiming || a.measure - b.measure),
    perLoop: plan.loops.map(l => {
      const ids = new Set(plan.targets.filter(t => t.loop === l.index).map(t => t.id));
      const evaluated = state.assessments.filter(a => ids.has(a.targetId));
      return {loop: l.index, evaluated: evaluated.length, matched: evaluated.filter(a => a.status === 'matched').length,
        extras: state.extras.filter(e => e.atMs >= l.startMs && e.atMs <= l.endMs).length};
    }), faults: state.faults, clock};
}
