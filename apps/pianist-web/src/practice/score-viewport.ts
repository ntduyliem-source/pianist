import type { Anchor, Box, ScoreSnapshot } from '../../../../packages/score-contracts';
import { type Timeline, tempoAt } from '../../../../packages/practice-engine-v2';

// Presentation only: native layout and performed spans determine where to look.
// This module never associates input or grades notes.
export interface ScoreSystem {
  id: string;
  page: number;
  measures: number[];
  box: Box;
}
export interface ScoreCursor {
  measure: number;
  visit: number;
  loop: number;
  x: number;
  anchors: string[];
}
export function scoreSystems(snapshot: ScoreSnapshot): ScoreSystem[] {
  const systems: ScoreSystem[] = [];
  for (const m of snapshot.measures) {
    if (!snapshot.pages[m.page]) continue;
    // The native snapshot explicitly uses the system Y/height for every measure.
    let system = systems.find((s) => s.page === m.page && Math.abs(s.box.y - m.box.y) < 1);
    if (!system) {
      system = { id: `system-${m.page}-${m.index}`, page: m.page, measures: [], box: { ...m.box } };
      systems.push(system);
    }
    system.measures.push(m.index);
    const right = Math.max(system.box.x + system.box.width, m.box.x + m.box.width);
    system.box.x = Math.min(system.box.x, m.box.x);
    system.box.width = right - system.box.x;
    system.box.height = Math.max(system.box.height, m.box.height);
  }
  // Systems guide the camera only. Sheet renders complete native pages;
  // no staff/notehead bounding box is allowed to crop musical symbols.
  return systems;
}
function lastAt<T>(items: T[], position: number, time: (item: T) => number) {
  let lo = 0,
    hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (time(items[mid]) <= position) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}
export function scorePositions(
  snapshot: ScoreSnapshot,
  t: Pick<Timeline, 'targets' | 'guide' | 'visits' | 'groups'> &
    Partial<Pick<Timeline, 'settings' | 'timeMap'>>,
) {
  const anchors = new Map(snapshot.anchors.filter((a) => a.visible).map((a) => [a.id, a])),
    targets = new Map(t.targets.map((n) => [n.id, n]));
  const anchorIds = new Map<string, string[]>();
  for (const a of anchors.values()) {
    const key = `${a.measure}:${a.tick}`,
      ids = anchorIds.get(key) ?? [];
    ids.push(a.id);
    anchorIds.set(key, ids);
  }
  const segments = new Map<number, NonNullable<ScoreSnapshot['cursorSegments']>>();
  for (const s of snapshot.cursorSegments ?? []) {
    const list = segments.get(s.measure) ?? [];
    list.push(s);
    segments.set(s.measure, list);
  }
  const timePoints = new Map<number, NonNullable<ScoreSnapshot['timeMap']>>();
  for (const p of snapshot.timeMap ?? []) {
    const list = timePoints.get(p.occurrence) ?? [];
    list.push(p);
    timePoints.set(p.occurrence, list);
  }
  const occurrences = new Map(snapshot.occurrences.map((o) => [o.index, o]));
  const practicePoints = new Map<number, NonNullable<Timeline['timeMap']>>();
  for (const p of t.timeMap ?? []) {
    const list = practicePoints.get(p.visit) ?? [];
    list.push(p);
    practicePoints.set(p.visit, list);
  }
  const nativeX = (measure: number, tick: number) => {
    const list = segments.get(measure);
    if (!list?.length) return;
    const s =
      list[
        Math.max(
          0,
          lastAt(list, tick, (p) => p.tick),
        )
      ];
    // Same tick interpolation as native PlaybackCursor, using its exported
    // ChordRest/end-barline coordinates (already offset by native spatium).
    const ratio = Math.max(0, Math.min(1, (tick - s.tick) / Math.max(1, s.endTick - s.tick)));
    return { x: s.x + (s.endX - s.x) * ratio, tick: s.tick };
  };
  return (position: number, waitGroup?: number): ScoreCursor | undefined => {
    if (!t.visits.length) return;
    if (waitGroup !== undefined) {
      const group = t.groups[Math.min(waitGroup, t.groups.length - 1)],
        notes = group?.ids.flatMap((id) => targets.get(id) ?? []) ?? [];
      const span = notes[0]?.spans[0],
        visit = t.visits.find((v) => v.id === span?.visit) ?? t.visits[0];
      const ids = notes.flatMap((n) =>
        n.spans.filter((s) => s.visit === visit.id).map((s) => s.anchor),
      );
      const tick = anchors.get(span?.anchor ?? '')?.tick ?? snapshot.measures[visit.measure].tick,
        point = nativeX(visit.measure, tick);
      return point
        ? { measure: visit.measure, visit: visit.id, loop: visit.loop, x: point.x, anchors: ids }
        : undefined;
    }
    const visit =
        t.visits[
          Math.max(
            0,
            lastAt(t.visits, position, (v) => v.startMs),
          )
        ],
      m = snapshot.measures[visit.measure];
    const progress = Math.max(
      0,
      Math.min(1, (position - visit.startMs) / Math.max(1, visit.endMs - visit.startMs)),
    );
    let tick: number;
    const mapped = practicePoints.get(visit.id);
    if (mapped?.length) {
      const i = Math.max(
          0,
          lastAt(mapped, position, (p) => p.atMs),
        ),
        a = mapped[i],
        b = mapped[i + 1] ?? a;
      const ratio =
        b.atMs > a.atMs ? Math.max(0, Math.min(1, (position - a.atMs) / (b.atMs - a.atMs))) : 0;
      tick = a.tick + (b.tick - a.tick) * ratio;
    } else if (t.settings?.tempoMode === 'fixed') tick = m.tick + (m.endTick - m.tick) * progress;
    else {
      const occurrence = occurrences.get(visit.occurrence),
        list = timePoints.get(visit.occurrence);
      if (!occurrence || !list?.length) return;
      const at = occurrence.startMs + progress * (occurrence.endMs - occurrence.startMs);
      const i = Math.max(
          0,
          lastAt(list, at, (p) => p.atMs),
        ),
        from = list[i],
        to = list[i + 1] ?? from;
      const ratio =
        to.atMs > from.atMs
          ? Math.max(0, Math.min(1, (at - from.atMs) / (to.atMs - from.atMs)))
          : 0;
      tick = from.tick + (to.tick - from.tick) * ratio;
    }
    const point = nativeX(visit.measure, tick);
    if (!point) return;
    const ids = anchorIds.get(`${visit.measure}:${point.tick}`) ?? [];
    return { measure: visit.measure, visit: visit.id, loop: visit.loop, x: point.x, anchors: ids };
  };
}
export function beatPosition(t: Timeline, position: number) {
  const bpm = Math.round(tempoAt(t, position));
  const i = lastAt(t.clicks, position, (b) => b.atMs);
  if (i < 0) return { beat: 0, total: 0, bpm };
  let start = i,
    end = i + 1;
  while (start > 0 && !t.clicks[start].accent) start--;
  while (end < t.clicks.length && !t.clicks[end].accent) end++;
  return { beat: i - start, total: end - start, bpm };
}
export interface FollowGeometry {
  top: number;
  bottom: number;
  left: number;
  focusTop: number;
  focusBottom: number;
  scrollTop: number;
  scrollLeft: number;
  width: number;
  height: number;
  contentWidth: number;
  contentHeight: number;
}
export function followTarget(g: FollowGeometry, force = false) {
  const pad = 16,
    available = g.height - pad * 2,
    tall = g.bottom - g.top > available;
  const top = tall ? g.focusTop : g.top,
    bottom = tall ? g.focusBottom : g.bottom;
  let y = g.scrollTop;
  if (force || top < g.scrollTop + g.height * 0.14 || bottom > g.scrollTop + g.height * 0.72) {
    y = top - g.height * 0.24;
    if (bottom - y > g.height - pad) y = bottom - g.height + pad;
    if (bottom - top > available) y = top - pad;
  }
  let x = g.scrollLeft;
  if (g.left < x + g.width * 0.12 || g.left > x + g.width * 0.85) x = g.left - g.width * 0.3;
  return {
    top: Math.max(0, Math.min(g.contentHeight - g.height, y)),
    left: Math.max(0, Math.min(g.contentWidth - g.width, x)),
  };
}
export function anchorBounds(anchors: Anchor[], fallback: Box): Box {
  if (!anchors.length) return fallback;
  const x = Math.min(...anchors.map((a) => a.box.x)),
    y = Math.min(...anchors.map((a) => a.box.y));
  return {
    x,
    y,
    width: Math.max(...anchors.map((a) => a.box.x + a.box.width)) - x,
    height: Math.max(...anchors.map((a) => a.box.y + a.box.height)) - y,
  };
}
