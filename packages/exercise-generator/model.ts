// Q0 exercise contracts; Q2's unreviewed source/voice data is deliberately kept
// in source-verification.ts. Fragment hands and grade profiles require Q3 review.
import type {ScoreSnapshot} from '../score-contracts/index';
import type {PracticeSettings, AttemptResult, Timeline} from '../practice-engine-v2/model';

export const EXERCISE_SCHEMA_VERSION = 1 as const;
export type ExerciseGrade = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type Hand = 'left' | 'right';
/** Reduced fraction in quarter-note units, denominator > 0; no rounded MIDI time. */
export interface Fraction {numerator: number; denominator: number}
export interface SpelledPitch {step: 'A'|'B'|'C'|'D'|'E'|'F'|'G'; alter: number; octave: number; midi: number}
export interface SourceOrigin {
  url: string; collection: string; revision: string; recordId: string;
  title: string; composer?: string; arranger?: string;
  license: {id: string; evidenceUrl: string; checkedAt?: string};
}
export interface Source {
  schemaVersion: 1; id: string; sha256: string; bytes: number;
  format: 'mxl'|'musicxml'|'mscz'|'abc';
  // Same bytes can have conflicting attribution. Preserve every origin.
  origins: SourceOrigin[];
  workGroupId?: string;
  visibility: 'public-approved'|'personal'|'pending-review';
  status: 'downloaded'|'parsed'|'verified'|'rejected';
  rejectionCodes: string[];
}
export interface VoiceRef {partId: string; staff: number; voice: number; hand: Hand}
export interface MusicalEvent {
  id: string; sourceNoteId?: string; lineId: string; measureIndex: number;
  /** Relative to fragment start; rests remain explicit events. */
  onset: Fraction; duration: Fraction;
  pitch?: SpelledPitch;
  kind: 'note'|'rest'; tieFrom?: string; tieTo?: string;
  articulations: string[];
}
export interface NotationContext {
  at: Fraction; lineId: string;
  clef: {sign: string; line: number; octaveChange: number};
  key: {fifths: number; mode: string};
  meter: {beats: number[]; beatType: number};
  octaveShift: number;
}
export interface Fragment {
  schemaVersion: 1; id: string; sourceId: string; corpusVersion: string;
  /** Lossless excerpt retained for unsupported notation and native cross-checks. */
  notation: {musicXmlAsset: string; sha256: string};
  /** Measure indices are zero-based; end is exclusive. Original labels may be text. */
  span: {startMeasure: number; endMeasure: number; startTick: number; endTick: number; ticksPerQuarter: number};
  lines: Record<string, VoiceRef>;
  context: NotationContext[];
  events: MusicalEvent[];
  tempos: {at: Fraction; quarterBpm: number}[];
  slurs: {startEventId: string; endEventId: string}[];
  pedal: {lineId: string; start: Fraction; end: Fraction}[];
  safeCut: {
    start: boolean; end: boolean; crossingTies: string[]; crossingHeldNotes: string[];
    crossingPedals: string[]; contextComplete: boolean; rejectionCodes: string[];
  };
  counts: {targets: number; onsets: number};
  profileIds: string[]; focusTags: string[]; motifGroupId: string;
  review: {status: 'pending'|'accepted'|'rejected'; method: string; evidence: string[]};
  nativeVerification: {engineBuild: string; semanticHash: string; verifiedAt: string};
}
export interface GradeProfile {
  schemaVersion: 1; id: string; version: string; grade: ExerciseGrade;
  focus: string[]; prerequisites: string[];
  // IDs refer to reviewed patterns, not unbounded "max difficulty" heuristics.
  rhythmPatternIds: string[]; keyIds: string[]; handPositionIds: string[];
  melodicIntervals: {diatonic: number; semitones: number}[];
  maxSimultaneousPerHand: number; maxVoicesPerHand: number;
  pitchRange: {minMidi: number; maxMidi: number};
  handMovement: {templateIds: string[]; maxSemitones: number; minPreparationMs: number};
  bpm: {min: number; max: number; beatQuarter: .5|1|1.5};
  allowedTransformIds: string[];
  allowedJoins: string[];
  introducedTogether: string[][];
}
export interface ExerciseSettings {
  schemaVersion: 1; grade: ExerciseGrade; profileId: string;
  notes: {min: number; max: number};
  mode: 'wait'|'bpm'; bpm: number; hand: Hand|'both';
  durationEnabled: boolean; pedalEnabled: boolean;
}
export interface Exercise {
  schemaVersion: 1; id: string; seed: string; kind: 'excerpt'|'transposed'|'composite';
  fragmentIds: string[];
  versions: {corpus: string; profile: string; generator: string; engine: string};
  transforms: {approvedId: string; fragmentId: string}[];
  provenance: {sourceId: string; originIndex: number; startMeasure: number; endMeasure: number}[];
  contentHash: string; musicalHash: string; motifGroupIds: string[];
  counts: {targets: number; onsets: number};
  snapshot: ScoreSnapshot;
  timeline: Timeline;
}
export interface ExerciseSession {
  schemaVersion: 1; id: string; seed: string; settings: ExerciseSettings;
  corpusVersion: string; profileVersion: string; engine: string;
  /** One common clock for Q6; a question does not restart it. */
  startedAt?: string;
  state: 'preparing'|'ready'|'running'|'paused'|'completed'|'interrupted';
  sequence: {
    exerciseId: string; absoluteStartMs: number; engineSettings: PracticeSettings;
    result?: AttemptResult; replayId?: string;
  }[];
}
