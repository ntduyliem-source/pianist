import {
  type Timeline,
  type AttemptResult,
  type PracticeSettings,
  ENGINE_ID,
} from '../../../../packages/practice-engine-v2';

// Calibration is a diagnostic exercise, not another matcher: taps go through
// the same production controller/Worker/ManiaKernel with upstream OD0 windows.
export function calibrationTimeline(settings: PracticeSettings): Timeline {
  const targets = Array.from({ length: 12 }, (_, i) => ({
    id: 'calibration:' + i,
    pitch: 60,
    atMs: 1000 + i * 750,
    endMs: 1100 + i * 750,
    measure: 0,
    occurrence: 0,
    loop: 0,
    anchors: [],
    spans: [],
    roles: ['right' as const],
    voices: [0],
  }));
  return {
    version: 2,
    engine: ENGINE_ID,
    projectId: 'calibration',
    revision: 1,
    fingerprint: 'calibration-v2-12x80',
    settings: {
      ...settings,
      mode: 'bpm',
      bpm: 80,
      beatQuarter: 1,
      tempoMode: 'fixed',
      countIn: 4,
      offsetMs: 0,
      difficulty: 0,
      metronome: true,
      loops: 1,
      accompaniment: false,
    },
    targets,
    groups: targets.map((n) => ({ atMs: n.atMs, ids: [n.id] })),
    visits: [{ id: 0, measure: 0, occurrence: 0, loop: 0, startMs: 0, endMs: 10000 }],
    clicks: targets.map((n) => ({ atMs: n.atMs, accent: true })),
    guide: [],
    durationMs: 10000,
    warnings: [],
  };
}
export function calibrationReport(result: AttemptResult) {
  const deltas = result.judgements
    .filter((j) => j.seq !== null && j.grade !== 'miss')
    .map((j) => j.delta)
    .sort((a, b) => a - b);
  // Median reports signed bias, never used as a score. The user explicitly
  // applies it; this measurement includes their own anticipation/delay.
  const count = deltas.length;
  return {
    count,
    offset: count
      ? Math.round((deltas[Math.floor((count - 1) / 2)] + deltas[Math.floor(count / 2)]) / 2)
      : null,
    spread: count
      ? Math.round(deltas[Math.ceil(0.9 * count) - 1] - deltas[Math.floor(0.1 * count)])
      : null,
    eligible: count >= 8 && result.faults.length === 0 && result.outcome === 'complete',
  };
}
