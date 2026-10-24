// Selection/coordinate adapter only. Every attack, pitch, release and tie span
// is supplied by MuseScore MPE; the osu and PTS kernels remain unchanged.
import type { ScoreSnapshot } from "../score-contracts";
import type { Target, Timeline, Visit } from "./model";
import { nativeVisitClock } from "./native-time";

export function nativePerformanceTargets(
  score: ScoreSnapshot,
  t: Timeline,
): { targets: Target[]; guide: Target[] } {
  const anchors = new Map(score.anchors.map((a) => [a.id, a]));
  const occurrences = new Map(score.occurrences.map((o) => [o.index, o]));
  const clocks = new Map(
    t.visits.map((v) => [
      v.id,
      nativeVisitClock(
        score,
        t.settings,
        occurrences.get(v.occurrence)!,
        v.loop,
      ),
    ]),
  );
  const runs: Visit[][] = [];
  for (const v of t.visits) {
    const run = runs.at(-1),
      prev = run?.at(-1);
    if (prev && prev.loop === v.loop && prev.occurrence + 1 === v.occurrence)
      run!.push(v);
    else runs.push([v]);
  }
  const targets: Target[] = [],
    guide: Target[] = [];
  for (const run of runs) {
    const first = run[0],
      last = run.at(-1)!,
      from = occurrences.get(first.occurrence)!.startMs,
      to = occurrences.get(last.occurrence)!.endMs;
    const byOccurrence = new Map(run.map((v) => [v.occurrence, v]));
    const convert = (ms: number) => {
      if (ms <= from) return first.startMs;
      if (ms >= to) return last.endMs;
      let lo = 0,
        hi = run.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (occurrences.get(run[mid].occurrence)!.startMs <= ms) lo = mid + 1;
        else hi = mid;
      }
      // Preserve sub-tick MPE precision. Its timestamps are projected through
      // the native tempo breakpoints, never rounded to a whole MIDI tick.
      const v = run[Math.max(0, lo - 1)];
      return v.startMs + clocks.get(v.id)!.at(ms);
    };
    for (const [index, event] of score.performance!.events.entries()) {
      if (event.atMs >= to || event.endMs <= from) continue;
      for (const lane of ["target", "guide"] as const) {
        const selected = event.spans.filter((s) => {
          const a = anchors.get(s.anchor),
            role = a && t.settings.roles[a.staff];
          if (
            !a ||
            !byOccurrence.has(s.occurrence) ||
            !a.play ||
            role === "off" ||
            !t.settings.voices.includes(a.voice)
          )
            return false;
          const hand = t.settings.hand === "both" || t.settings.hand === role;
          return lane === "target"
            ? hand
            : !hand && t.settings.accompaniment && t.settings.mode === "bpm";
        });
        if (!selected.length) continue;
        // A tie cut at A is reattacked at A. Excluded hands/voices never add
        // their own anchors or extend another hand's release.
        const firstSpan = selected[0],
          lastSpan = selected.at(-1)!;
        const allSources = event.anchors.every((id) =>
          selected.some((s) => s.anchor === id),
        );
        const start = Math.max(allSources ? event.atMs : firstSpan.atMs, from),
          end = Math.min(allSources ? event.endMs : lastSpan.endMs, to);
        const atMs = convert(start),
          endMs = convert(end);
        if (endMs <= atMs) continue;
        const ids = [...new Set(selected.map((s) => s.anchor))],
          v = byOccurrence.get(selected[0].occurrence)!;
        const spans = selected.map((s) => {
          const visit = byOccurrence.get(s.occurrence)!;
          return {
            anchor: s.anchor,
            visit: visit.id,
            atMs: Math.max(
              atMs,
              visit.startMs + clocks.get(visit.id)!.at(s.atMs),
            ),
            endMs: Math.min(
              endMs,
              visit.startMs + clocks.get(visit.id)!.at(s.endMs),
            ),
          };
        });
        // First ornament/grace span must start at its actual attack, not the
        // written chord timestamp. Tied successors retain native source spans.
        spans[0].atMs = atMs;
        const target: Target = {
          id: `${first.loop}:${first.occurrence}:mpe${index}:${lane}`,
          pitch: event.pitch,
          atMs,
          endMs,
          releaseMs: endMs,
          measure: v.measure,
          occurrence: v.occurrence,
          loop: v.loop,
          anchors: ids,
          spans,
          roles: [
            ...new Set(
              ids.map((id) => t.settings.roles[anchors.get(id)!.staff]),
            ),
          ],
          voices: [...new Set(ids.map((id) => anchors.get(id)!.voice))],
        };
        (lane === "target" ? targets : guide).push(target);
      }
    }
  }
  return { targets, guide };
}
