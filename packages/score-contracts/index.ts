export const SCHEMA_VERSION = 1;
export const ALGORITHM_VERSION = 'pianist-onset-1.1.0';
export type Role = 'left' | 'right' | 'off';
export type Mode = 'wait' | 'bpm';
export interface Box {x: number; y: number; width: number; height: number}
export interface Anchor {id: string; pitch: number; tick: number; durationTicks: number; measure: number; staff: number; visualStaff: number; track: number; voice: number; page: number; visible: boolean; play: boolean; box: Box; tieBack?: string}
export interface ScorePage {index: number; width: number; height: number; displayWidth: number; offsetX: number; offsetY: number; svg: string}
export interface Measure {index: number; label: number; tick: number; endTick: number; page: number; box: Box; numerator: number; denominator: number}
export interface Occurrence {index: number; measure: number; startMs: number; endMs: number; utick: number}
export interface ScoreSnapshot {
  schemaVersion: 1; projectId: string; revision: number; fingerprint: string; title: string; baseQuarterBpm: number; durationMs: number;
  staves: {id: number; part: string; partId: string}[]; pages: ScorePage[]; measures: Measure[]; anchors: Anchor[];
  occurrences: Occurrence[]; performed: {anchor: string; occurrence: number; atMs: number; endMs: number}[];
  beats: {atMs: number; accent: boolean; occurrence: number; beatQuarter?: number}[]; warnings: string[];
}
export interface SessionConfig {
  mode: Mode; bpm: number; beatQuarter: number; countIn: number; metronome: boolean;
  fromMeasure: number; toMeasure: number; hand: 'both' | 'left' | 'right'; roles: Record<number, Role>; voices: number[];
  loops: number; offsetMs: number; perfectMs: number; goodMs: number; windowMs: number; deliveryMs: number;
  inputSource: 'midi' | 'virtual'; deviceId: string; algorithmVersion: string;
  accompaniment?: boolean;
  loopBpmStep?: number;
}
export interface Attack {id: string; pitch: number; atMs: number; endMs: number; anchors: string[]; roles: Role[]; measure: number; occurrence: number; loop: number; spans?: {anchor: string; occurrence: number; atMs: number; endMs: number}[]}
export interface Visit {measure: number; occurrence: number; loop: number; pass: number; startMs: number; endMs: number}
export interface Plan {schemaVersion: 1; projectId: string; revision: number; fingerprint: string; targets: Attack[]; durationMs: number; config: SessionConfig; beats: {atMs: number; accent: boolean}[]; groups: {atMs: number; endMs: number; targets: Attack[]}[]; loops: {index: number; startMs: number; endMs: number; bpm?: number}[]; visits?: Visit[]; accompaniment?: Attack[]}
export interface InputEvent {seq: number; epoch: number; type: 'on' | 'off' | 'pedal'; pitch: number; velocity: number; channel: number; deviceId: string; atMs: number; receivedMs: number; source: 'midi' | 'virtual'}
export interface Assessment {targetId: string; status: 'matched' | 'missed'; eventSeq?: number; deltaMs?: number; performedAtMs?: number; grade?: 'perfect' | 'good' | 'outside'; atMs: number}
export interface Extra {seq: number; pitch: number; atMs: number; reason: string; loop?: number; measure?: number}
// Live feedback never contributes to a result until the matcher finalizes it.
export interface LiveNote {seq: number; pitch: number; held: boolean; targetId?: string; state: 'matched' | 'extra' | 'ignored'; provisional: boolean; deltaMs?: number; grade?: Assessment['grade']}
export interface CoreState {assessments: Assessment[]; extras: Extra[]; cursor: number; done: boolean; faults: string[]; firstTry: number; groupsDone: number; corrections: number; held: number[]; missing: number[]; live?: LiveNote[]; restMs?: number}
export type ReplayStep = {kind: 'event'; event: InputEvent} | {kind: 'advance'; atMs: number} | {kind: 'clearHeld'; atMs: number};
export type SessionStatus = 'ready' | 'counting' | 'running' | 'paused' | 'interrupted' | 'finished';
export interface SessionResult {
  id: string; schemaVersion: 1; createdAt: number; projectId: string; revision: number; fingerprint: string; title: string; config: SessionConfig;
  outcome: 'complete' | 'aborted' | 'interrupted'; elapsedMs: number; planned: number; evaluated: number; matched: number; missed: number; extras: number; good: number;
  coverage: number | null; precision: number | null; timingRate: number | null; medianAbsMs: number | null; p90AbsMs: number | null; signedMeanMs: number | null;
  firstTry: number; groupsDone: number; corrections: number; assessments: Assessment[]; extraEvents: Extra[]; targets: Attack[];
  chords: {ids: string[]; spreadMs: number | null; complete: boolean}[];
  weakMeasures: {measure: number; missed: number; badTiming: number; evaluated: number; extras?: number}[];
  perLoop: {loop: number; matched: number; evaluated: number; extras: number}[]; faults: string[]; clock: string;
  replay?: {events: InputEvent[]; plan: Plan; commands: ReplayStep[]};
}
