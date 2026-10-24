import type { ScoreSnapshot, Occurrence } from "../score-contracts";
import type { PracticeSettings } from "./model";

/** Unit conversion of native tempo breakpoints. Equal-tick points are fixed
 * pauses: MuseScore keeps their seconds when changing the tempo multiplier. */
export function nativeVisitClock(
  score: ScoreSnapshot,
  c: PracticeSettings,
  o: Occurrence,
  loop: number,
) {
  const m = score.measures.find((m) => m.index === o.measure)!;
  const bpm = c.bpm + loop * c.loopBpmStep;
  const quarter = 60000 / (bpm * c.beatQuarter),
    scale = score.baseQuarterBpm / (bpm * c.beatQuarter);
  const source = score.timeMap?.filter((p) => p.occurrence === o.index) ?? [];
  const points = source.length
    ? source
    : [
        { tick: m.tick, atMs: o.startMs },
        { tick: m.endTick, atMs: o.endMs },
      ];
  let elapsed = 0;
  const mapped = points.map((p, i) => {
    if (i) {
      const prev = points[i - 1];
      elapsed +=
        c.tempoMode === "fixed"
          ? ((p.tick - prev.tick) / 480) * quarter
          : (p.atMs - prev.atMs) * (p.tick === prev.tick ? 1 : scale);
    }
    return { ...p, elapsed };
  });
  const at = (ms: number, utick?: number) => {
    if (c.tempoMode === "fixed" && utick !== undefined)
      return ((utick - o.utick) / 480) * quarter;
    let i = 0;
    while (i + 1 < mapped.length && mapped[i + 1].atMs <= ms) i++;
    const a = mapped[i],
      b = mapped[i + 1];
    if (!b) return a.elapsed + (ms - a.atMs) * scale;
    const ratio = b.atMs > a.atMs ? (ms - a.atMs) / (b.atMs - a.atMs) : 0;
    return a.elapsed + (b.elapsed - a.elapsed) * ratio;
  };
  return { at, lengthMs: elapsed, points: mapped };
}
