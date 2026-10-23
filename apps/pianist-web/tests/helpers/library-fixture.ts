import type { NativeScoreData } from '../../../../packages/score-contracts';
export function pianoStaves(): NativeScoreData['staves'] {
  return [0, 1].map((id) => ({
    id,
    part: 'Piano',
    partId: 'p',
    instruments: [{ tick: -1, id: 'piano', soundId: 'keyboard.piano', programs: [0] }],
  }));
}
