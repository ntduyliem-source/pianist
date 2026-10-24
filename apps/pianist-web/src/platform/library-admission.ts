import type { ScoreSnapshot } from '../../../../packages/score-contracts';

export const LIBRARY_STAFF_POLICY = 'two-staves-v2';

/** Structural facts come from MuseScore, including every instrument change.
 * Empty measures, clef changes and two separate piano parts remain valid. */
export function requireLibraryScore(score: Pick<ScoreSnapshot, 'staves'>): void {
  if (!Array.isArray(score.staves) || score.staves.length !== 2) {
    throw Error(
      `Thư viện chỉ nhận bản piano đúng 2 khuông. Bản này có ${score.staves?.length ?? 0} khuông.`,
    );
  }
}
