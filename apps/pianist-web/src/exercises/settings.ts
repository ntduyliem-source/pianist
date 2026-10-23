import type { ScoreSnapshot } from '../../../../packages/score-contracts';
import { settingsFor } from '../../../../packages/practice-engine-v2/score-adapter';
import type { PracticeSettings } from '../../../../packages/practice-engine-v2/model';
import type { Exercise, Hand } from './bank';

export const LENGTHS = ['n4', 'n6', 'n10', 'n20', 'n30', 'n50', 'n100'] as const;
export interface Selection {
  grade: number;
  lengths: string[];
  random: boolean;
  hand: Hand;
  mode: 'wait' | 'bpm';
  bpm: number;
  auto: boolean;
}
export const DEFAULT_SELECTION: Selection = {
  grade: 1,
  lengths: ['n4'],
  random: true,
  hand: 'both',
  mode: 'bpm',
  bpm: 60,
  auto: true,
};
export function readSelection(value: unknown): Selection {
  const v = value && typeof value === 'object' ? (value as Partial<Selection>) : {};
  return {
    grade: Number.isInteger(v.grade) && v.grade! >= 1 && v.grade! <= 8 ? v.grade! : 1,
    lengths: Array.isArray(v.lengths)
      ? LENGTHS.filter((id) => v.lengths!.includes(id))
      : [...DEFAULT_SELECTION.lengths],
    random: typeof v.random === 'boolean' ? v.random : true,
    hand: v.hand === 'left' || v.hand === 'right' ? v.hand : 'both',
    mode: v.mode === 'wait' ? 'wait' : 'bpm',
    bpm:
      typeof v.bpm === 'number' && Number.isFinite(v.bpm)
        ? Math.round(Math.max(20, Math.min(300, v.bpm)))
        : 60,
    auto: typeof v.auto === 'boolean' ? v.auto : true,
  };
}
export function exerciseSettings(
  snapshot: ScoreSnapshot,
  entry: Exercise,
  selection: { mode: 'wait' | 'bpm'; bpm: number; hand?: Hand },
  deviceId: string,
): PracticeSettings {
  const config = settingsFor(snapshot);
  // Selecting a hand changes only graded targets; retain both source staves.
  config.roles = Object.fromEntries(
    snapshot.staves.map((s, i) => [s.id, i === 0 ? 'right' : 'left']),
  );
  return {
    ...config,
    hand: selection.hand ?? 'both',
    mode: selection.mode,
    bpm: selection.bpm,
    beatQuarter: (entry.beatQuarter.length === 1 && [0.5, 1, 1.5].includes(entry.beatQuarter[0])
      ? entry.beatQuarter[0]
      : 1) as 0.5 | 1 | 1.5,
    deviceId,
    inputSource: deviceId === 'virtual' ? 'virtual' : 'midi',
  };
}
