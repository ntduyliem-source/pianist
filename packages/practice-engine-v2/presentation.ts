import { ManiaHitWindows, type Grade } from './upstream/mania';

export type OnsetGrade = Grade;

/** Read the same source-derived windows the scorer uses; never recalculate them in UI. */
export function hitWindows(difficulty: number): Readonly<Record<OnsetGrade, number>> {
  return new ManiaHitWindows(difficulty).values;
}
