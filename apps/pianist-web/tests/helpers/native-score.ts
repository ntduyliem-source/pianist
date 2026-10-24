import type {
  NativePracticeSnapshot,
  NativeScoreSemantics,
} from '../../../../packages/score-contracts';
import { scoreFixture } from './fixtures-v2';

/** Current native contract fixture, separate from historical grading oracles. */
export function nativeSnapshot(revision = 0): NativePracticeSnapshot {
  const { projectId: _projectId, fingerprint: _fingerprint, ...score } = scoreFixture();
  return {
    ...score,
    revision,
    staves: score.staves.map((staff) => ({
      ...staff,
      instruments: [{ tick: -1, id: 'piano', soundId: 'keyboard.piano', programs: [0] }],
    })),
    pages: [
      {
        index: 0,
        width: 100,
        height: 200,
        displayWidth: 100,
        offsetX: 0,
        offsetY: 0,
        svg: '<svg/>',
      },
    ],
    beats: score.beats.map((beat) => ({ ...beat, beatQuarter: 1 })),
    cursorSegments: [],
    timeMap: [],
    tempos: [],
    unsupported: [],
    durationReference: 'musescore-midi',
    keyReleases: [],
    pedals: [],
    performance: {source:'musescore-mpe',events:[{anchors:['n'],pitch:60,atMs:500,endMs:975,utick:480,endUtick:936,
      spans:[{anchor:'n',occurrence:0,atMs:500,endMs:975,utick:480,endUtick:936}]}]},
  };
}
export function nativeSemantics(revision = 0): NativeScoreSemantics {
  const score = nativeSnapshot(revision);
  return {
    ...score,
    pages: [],
    anchors: score.anchors.map((n) => ({ ...n, spelling: 14, userVelocity: 0 })),
    rests: [],
    keys: [],
    slurs: [],
    dynamics: [],
  };
}
