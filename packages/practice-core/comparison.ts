import type {SessionResult} from '../score-contracts/index';

// Different timing settings, score content or input sources are different tasks.
// Layout-only revisions may be compared when their semantic fingerprint matches.
export function comparable(a: SessionResult, b: SessionResult): boolean {
  if (a.id === b.id || a.outcome !== 'complete' || b.outcome !== 'complete' || a.faults.length || b.faults.length) return false;
  const key = (r: SessionResult) => {
    const c = r.config;
    return JSON.stringify([r.projectId, r.fingerprint, r.clock, r.planned, c.algorithmVersion, c.mode, c.bpm, c.beatQuarter,
      c.countIn, c.metronome, c.fromMeasure, c.toMeasure, c.hand, Object.entries(c.roles).sort(([a], [b]) => a.localeCompare(b)), [...c.voices].sort(),
      c.loops, c.offsetMs, c.perfectMs, c.goodMs, c.windowMs, c.deliveryMs, c.inputSource, c.deviceId, !!c.accompaniment, c.loopBpmStep ?? 0, c.releaseMode ?? 'off', c.arpeggioMs ?? 0]);
  };
  return key(a) === key(b);
}
