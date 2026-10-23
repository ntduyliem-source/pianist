import type { PlaybackTimePoint } from '../../../../packages/engine-bridge';

// Adjacent points are read from MuseScore's original TempoMap and RepeatList,
// including pre/post-pause points. Interpolation changes coordinate systems;
// it does not extrapolate playback or scale fixed pauses with the selected BPM.
export function mapPlaybackTime(
  points: readonly PlaybackTimePoint[],
  ms: number,
  toReference = true,
): number {
  if (points.length < 2) throw Error('Thiếu bản đồ thời gian MuseScore.');
  const input = (p: PlaybackTimePoint) => (toReference ? p.playbackMs : p.referenceMs);
  const output = (p: PlaybackTimePoint) => (toReference ? p.referenceMs : p.playbackMs);
  let lo = 0,
    hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (input(points[mid]) <= ms) lo = mid + 1;
    else hi = mid;
  }
  if (!lo) return output(points[0]);
  const before = points[lo - 1],
    after = points[lo];
  if (!after) return output(before);
  const duration = input(after) - input(before);
  return duration > 0
    ? output(before) + ((ms - input(before)) / duration) * (output(after) - output(before))
    : output(before);
}
