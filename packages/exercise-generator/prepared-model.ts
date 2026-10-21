// V2: immutable offline exercises. V1 candidates cannot be cast into this type.
import type {ExerciseGrade, Fraction, Hand} from './model';
import type {ScoreSnapshot} from '../score-contracts';
import type {PracticeSettings, AttemptResult} from '../practice-engine-v2/model';

export type LengthBucketId = 'n4'|'n6'|'n10'|'n20'|'n30'|'n50'|'n100';
export interface LengthBucket {id:LengthBucketId; label:string; min:number; max:number}
export interface PreparedReview {
  status:'accepted-local-pilot'; method:'source-context-and-score-inspection';
  reviewer:string; reviewerRole:'assistant'; teacherReviewed:false; reviewedAt:string;
  selectionSha256:string; contextSha256:string;
  startReason:string; endReason:string; musicalReason:string; handReason:string;
  tonality:'C major'; tonalityReason:string;
}
export interface PreparedAsset {path:string; sha256:string; bytes:number}
export interface PreparedExercise {
  schemaVersion:2; id:string; title:string;
  sourceSha256:string; sourceLineId:string; sourceEventIds:string[];
  sourceSpan:{startMeasure:number;endMeasure:number;startTick:number;endTick:number;ticksPerQuarter:480};
  source:{sourceSha256:string;analysisSha256:string;origins:{title:string;composer:string|null;
    source_url:string;collection:string;revision:string;license_id:string;license_url:string}[]};
  grade:ExerciseGrade;profileId:string;hand:Hand|'both';lengthBucket:LengthBucketId;
  counts:{targets:number;onsets:number};unitKind:'motif'|'phrase'|'phrase-sequence'|'complete-piece';
  exactHash:string;motifHash:string;bpm:{min:number;max:number;beatQuarter:1|1.5};durationQuarter:Fraction;
  status:'approved-local-pilot';visibility:'local-only';review:PreparedReview;
  gradeEvidence:{passed:true;grade:ExerciseGrade;profileId:string;hand:Hand|'both';sourceEventIds:string[];
    rejectionCodes:[];contextSha256:string;focusEventPairs:[string,string][]};
  projectionVerification:{passed:true;rejectionCodes:[]};
  versions:{parser:string;profile:string;lengths:string;builder:string;native:string;engine:string;
    renderer:Record<string,string>};
  assets:Record<'notation'|'snapshot'|'timeline'|'context',PreparedAsset>;
}
/** Fractions are quarter-note units, from the existing adapter at 60 quarter BPM. */
export interface PreparedBeatTimeline {
  schemaVersion:2;engine:string;beatUnitQuarter:1;durationQuarter:number;
  targets:{id:string;pitch:number;atQuarter:number;endQuarter:number;releaseQuarter?:number;anchors:string[]}[];
}
export interface PreparedCatalog {
  schemaVersion:2;corpusVersion:string;pipeline:string;visibility:'local-only';stage:'Q4-pilot';
  lengthBuckets:LengthBucket[];entries:PreparedExercise[];
  coverage:{exerciseCount:number;exactContents:number;motifs:number;sourceFiles:number;
    cells:{grade:ExerciseGrade;hand:Hand|'both';lengthBucket:LengthBucketId;exercises:number;motifs:number;sourceFiles:number}[];
    sourceOverlapPairs:[string,string][]};
}
export interface PreparedExerciseSettings {
  schemaVersion:2;grade:ExerciseGrade;profileId:string;hand:Hand|'both';lengthBucket:LengthBucketId;
  mode:'wait'|'bpm';bpm:number;durationEnabled:boolean;pedalEnabled:boolean;
}
export interface PreparedExerciseSession {
  schemaVersion:2;id:string;corpusVersion:string;settings:PreparedExerciseSettings;
  state:'preparing'|'ready'|'running'|'paused'|'finished'|'interrupted';
  sequence:{exerciseId:string;absoluteStartMs:number;settings:PracticeSettings;result?:AttemptResult}[];
}
export interface PreparedContent {exercise:PreparedExercise;snapshot:ScoreSnapshot;timeline:PreparedBeatTimeline}
