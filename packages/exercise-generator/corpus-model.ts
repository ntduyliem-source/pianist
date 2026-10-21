// Q3 OFFLINE candidates. Deliberately distinct from reviewed Fragment /
// GradeProfile in model.ts. Q4 must not promote a candidate via a type cast.
import type {ExerciseGrade, Hand} from './model';

export type RhythmCellFamily = 'quarters'|'long-notes'|'quarter-rests'|'paired-eighths'
  |'dotted'|'tied-eighths'|'syncopated'|'compound';
export interface CandidateGradeRules {
  id: string; grade: ExerciseGrade; status: 'candidate-rules-only'; enabled: false;
  focusRule: 'steps'|'thirds'|'triads'|'new-position'|'two-hands'|'leaps'|'rhythm'|'register';
  maxInterval: number; rhythms: RhythmCellFamily[]; positions: string[];
  fifths: number[]; meters: string[]; lines: 1|2;
  bpm: {min: number; max: number; beatQuarter: 1|1.5};
  movement: null|{minPreparationMs: number; template: string};
  allowedTransforms: ['original-excerpt']; allowedJoins: [];
  reviewRequirements: string[];
}
export interface HandTemplateProposal {
  id: string; group: string; hand: Hand; clef: 'G'|'F'; fifths: number;
  keys: {pitch: [string, number, number]; finger: number}[];
  reviewStatus: 'design-proposal'; sourceFingering: false; evidence: string[];
}
export interface CandidateMatch {
  profileId: string; grade: ExerciseGrade; purpose: 'focus';
  rhythms: Record<string, RhythmCellFamily[]>;
  handWitnesses: Record<string, {templateId: string; hand: Hand;
    positions?: string[]; fingers: [string, number][]}>;
}
export interface CorpusFragmentCandidate {
  schemaVersion: 1; id: string; sourceId: string; corpusVersion: string;
  sourceAnalysisSha256: string;
  selection: {lineIds: string[]; kind: 'original-piano-line-selection'};
  span: {startMeasure: number; endMeasure: number; startTick: number; endTick: number; ticksPerQuarter: 480};
  sourceMeasureLabels: string[];
  /** Search bound only. counts comes from native + the existing score adapter. */
  preliminaryAttackBound: number;
  counts: null|{targets: number; onsets: number}; matches: CandidateMatch[];
  exactHash: string; motifGroupId: string; nearDuplicateGroupId: string;
  sourceGroupId: string; workGroupId: null; workIdentityStatus: 'unreviewed';
  keyModeStatus: 'explicit'|'unconfirmed'; visibility: 'personal'|'pending-review';
  review: {status: 'pending'; method: null; evidence: []; teacherReviewed: false};
  acceptedForPractice: false;
  notation?: {musicXmlAsset: string; sha256: string};
  /** Full Q2 events/contexts/ties/tempos, never another reduced MIDI parser. */
  analysis?: {asset: string; sha256: string};
  projectionVerification?: {passed: boolean; rejectionCodes: string[];
    sourceEvents: number; excerptEvents: number;
    lineMap: Record<string, string>; eventMap: Record<string, string>};
  nativeVerification?: {status: 'pending'}|{status: 'matched'; engineBuild: string;
    verifierBuild: string; semanticHash: string; verifiedAt: string;
    voiceMap: Record<string, {staff: number; voice: number}>};
  profileIds?: string[];
}
