import type {Timeline} from '../practice-engine-v2';
import type {ExerciseSettings} from './model';

/** Physical key attacks, as resolved by the existing score adapter, not XML <note>s. */
export function exerciseCounts(timeline: Timeline): {targets: number; onsets: number} {
  if (timeline.settings.loops !== 1) throw Error('Một câu tập phải dùng timeline một lượt.');
  return {targets: timeline.targets.length, onsets: timeline.groups.length};
}

/** Structural bounds only. Q3/Q4 must also enforce the selected grade profile. */
export function validateExerciseSettings(value: ExerciseSettings): void {
  const integer = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;
  if (!value || value.schemaVersion !== 1 || !integer(value.grade, 1, 8)
    || typeof value.profileId !== 'string' || !value.profileId.trim()
    || !value.notes || !integer(value.notes.min, 4, 64) || !integer(value.notes.max, value.notes.min, 64)
    || !['wait', 'bpm'].includes(value.mode) || !Number.isFinite(value.bpm) || value.bpm < 20 || value.bpm > 300
    || !['left', 'right', 'both'].includes(value.hand)
    || typeof value.durationEnabled !== 'boolean' || typeof value.pedalEnabled !== 'boolean') {
    throw Error('Thiết lập bài tập không hợp lệ: chọn grade, profile và khoảng 4–64 nốt.');
  }
}
