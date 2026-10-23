import type { ScoreSnapshot } from '../../../../packages/score-contracts';

export const LIBRARY_STAFF_POLICY = 'piano-two-staves-v1';

/** Structural facts come from MuseScore, including every instrument change.
 * Empty measures, clef changes and two separate piano parts remain valid. */
export function requireLibraryScore(score: Pick<ScoreSnapshot, 'staves'>): void {
  if (!Array.isArray(score.staves) || score.staves.length !== 2) {
    throw Error(
      `Thư viện chỉ nhận bản piano đúng 2 khuông. Bản này có ${score.staves?.length ?? 0} khuông.`,
    );
  }
  for (const staff of score.staves) {
    if (!staff.instruments?.length) {
      throw Error(
        'Engine chưa cung cấp thông tin nhạc cụ để kiểm tra thư viện. Hãy tải lại ứng dụng.',
      );
    }
    for (const instrument of staff.instruments) {
      // Native General MIDI is zero-based: acoustic/electric piano = 0..5.
      if (
        !instrument.programs.length ||
        instrument.programs.some((p) => !Number.isInteger(p) || p < 0 || p > 5)
      ) {
        throw Error(
          'Thư viện chỉ nhận đúng 2 khuông piano; bản này có nhạc cụ khác hoặc chưa xác định được nhạc cụ.',
        );
      }
    }
  }
}
