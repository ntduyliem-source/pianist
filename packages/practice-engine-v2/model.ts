import type {ScoreSnapshot} from '../score-contracts/index';
import type {Grade, Judgement} from './upstream/mania';

export const ENGINE_ID = 'pianist-v2.osu-676f3b0.pts-b40e412.mir-fe73b35.ns-3582550.3';
export type Hand = 'left' | 'right' | 'off';
export interface PracticeSettings {
  version: 2; mode: 'wait' | 'bpm'; bpm: number; beatQuarter: .5 | 1 | 1.5;
  tempoMode: 'fixed' | 'score'; countIn: number; metronome: boolean;
  fromMeasure: number; toMeasure: number; hand: 'both' | 'left' | 'right';
  roles: Record<number, Hand>; voices: number[]; loops: number; loopBpmStep: number;
  accompaniment: boolean; difficulty: number; offsetMs: number; maxDeliveryMs: number;
  inputSource: 'midi' | 'virtual'; deviceId: string;
  durationEnabled?: boolean; pedalEnabled?: boolean;
}
export interface Target {
  id: string; pitch: number; atMs: number; endMs: number; measure: number; occurrence: number; loop: number;
  anchors: string[]; spans: {anchor: string; visit: number; atMs: number; endMs: number}[];
  roles: Hand[]; voices: number[];
  releaseMs?: number;
  velocity?: number;
}
export interface PedalTarget {id:string; atMs:number; endMs:number; loop:number}
export interface Visit {id: number; measure: number; occurrence: number; loop: number; startMs: number; endMs: number}
export interface Timeline {
  version: 2; engine: string; projectId: string; revision: number; fingerprint: string;
  settings: PracticeSettings; targets: Target[]; visits: Visit[];
  groups: {atMs: number; ids: string[]}[]; clicks: {atMs: number; accent: boolean}[];
  guide: Target[]; durationMs: number; warnings: string[];
  // BPM in the selected beat unit, exported from native tempo at each position.
  tempos?: {atMs:number; bpm:number}[];
  pedals?: PedalTarget[]; pedalReference?: boolean;
}
export interface MidiEvent {
  sequence: number; kind: 'on' | 'off' | 'pedal'; pitch: number; value: number; channel: number;
  portId: string; source: 'midi' | 'virtual'; timestampMs: number; receivedMs: number; synthetic?: boolean; stateOnly?: boolean;
}
export interface KeyInterval {
  sequence: number; pitch: number; channel: number; portId: string; onMs: number;
  keyOffMs?: number; soundOffMs?: number; interrupted?: boolean; keyInterrupted?: boolean; stateOnly?: boolean; closedBy?:'pause'|'stop'|'reset';
}
export interface PedalInterval {sequence:number; onMs:number; offMs?:number; portId:string; channel:number; interrupted?:boolean; stateOnly?:boolean; closedBy?:'pause'|'stop'|'reset'}
export interface PedalControl {atMs:number; value:number; portId:string; channel:number; synthetic?:boolean}
export interface ReleaseJudgement {id:string; sequence:number|null; expectedMs:number|null; actualMs:number|null; deltaMs:number|null; toleranceMs:number|null;
  status:'correct'|'early'|'late'|'unreleased'|'interrupted'|'no-attack'|'unavailable'|'pending'}
export interface R4Report {
  profile:'mir_eval-offset+note-seq+pedal-200ms';
  key:ReleaseJudgement[]; sound:ReleaseJudgement[];
  pedal:{status:'scored'|'disabled'|'no-reference'|'wait'|'partial'; reference:number; performed:number; interrupted:number;
    matching:[number,number][]; precision:number; recall:number; f1:number; overlap:number;
    targets:PedalTarget[]; intervals:PedalInterval[]};
}
export interface Unconsumed {sequence: number; pitch: number; atMs: number}
export interface EngineView {
  judgements: Judgement[]; extras: Unconsumed[]; held: number[]; pedal: boolean;
  intervals: KeyInterval[]; group: number; done: boolean; processedMs: number; faults: string[];
  pedalIntervals?:PedalInterval[]; controls?:PedalControl[]; releaseFeedback?:ReleaseJudgement;
}
export type ReplayCommand = {type: 'input'; event: MidiEvent} | {type: 'clock'; atMs: number}
  | {type: 'boundary'; atMs: number; kind: 'pause' | 'resume' | 'stop'};
export type AttemptStatus = 'ready' | 'counting' | 'running' | 'paused' | 'interrupted' | 'finished';
export interface AttemptResult {
  id: string; schemaVersion: 2; engine: string; createdAt: number; projectId: string; revision: number;
  fingerprint: string; title: string; settings: PracticeSettings; outcome: 'complete' | 'aborted' | 'interrupted';
  elapsedMs: number; timeline: Timeline; judgements: Judgement[]; extras: Unconsumed[];
  intervals: KeyInterval[]; faults: string[];
  pedalIntervals?:PedalInterval[]; controls?:PedalControl[]; r4?:R4Report;
  metrics: {planned: number; evaluated: number; hits: number; misses: number; extras: number; inputs: number;
    accuracy: number | null; coverage: number | null; precision: number | null;
    medianAbsMs: number | null; p90AbsMs: number | null; signedMeanMs: number | null; grades: Record<Grade, number>};
  replay?: {engine: string; commands: ReplayCommand[]};
  clock?: {segments:{originPerformanceMs:number;audioMinusPerformanceSeconds:number;source:'output-timestamp'|'audio-current-time';resumeAtMs:number}[]};
  simulation?: {script:'native-targets-onset'|'native-release-pedal';deltaMs:number};
}
// Historical JSON is data only. There is no v1 evaluator, config adapter or replay loader.
export interface ArchivedAttempt {
  id: string; schemaVersion: 1; createdAt: number; projectId: string; title: string;
  [field: string]: unknown;
}
export type SavedAttempt = AttemptResult | ArchivedAttempt;
export type Snapshot = ScoreSnapshot;
