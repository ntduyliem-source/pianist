export const SCHEMA_VERSION = 1;
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Anchor {
  id: string;
  pitch: number;
  tick: number;
  durationTicks: number;
  measure: number;
  staff: number;
  visualStaff: number;
  track: number;
  voice: number;
  page: number;
  visible: boolean;
  play: boolean;
  box: Box;
  tieBack?: string;
  articulations?: string[];
  arpeggio?: 'up' | 'down';
  arpeggioGroup?: string;
  userVelocity?: number;
  spelling?: number;
  grace?: boolean;
}
export interface NativePerformanceNote {
  anchors: string[];
  spans: {anchor: string; occurrence: number; atMs: number; endMs: number; utick: number; endUtick: number}[];
  pitch: number;
  atMs: number;
  endMs: number;
  utick: number;
  endUtick: number;
}
export interface ScorePage {
  index: number;
  width: number;
  height: number;
  displayWidth: number;
  offsetX: number;
  offsetY: number;
  svg: string;
}
export interface Measure {
  index: number;
  label: number;
  tick: number;
  endTick: number;
  page: number;
  box: Box;
  numerator: number;
  denominator: number;
}
export interface Occurrence {
  index: number;
  measure: number;
  startMs: number;
  endMs: number;
  utick: number;
}
export interface StaffInstrument {
  tick: number;
  id: string;
  soundId: string;
  programs: number[];
}
export interface ScoreStaff {
  id: number;
  part: string;
  partId: string;
  instruments?: StaffInstrument[];
}
export interface ScoreSnapshot {
  schemaVersion: 1;
  projectId: string;
  revision: number;
  fingerprint: string;
  title: string;
  baseQuarterBpm: number;
  durationMs: number;
  staves: ScoreStaff[];
  pages: ScorePage[];
  measures: Measure[];
  anchors: Anchor[];
  occurrences: Occurrence[];
  performed: { anchor: string; occurrence: number; atMs: number; endMs: number }[];
  beats: { atMs: number; accent: boolean; occurrence: number; beatQuarter?: number }[];
  warnings: string[];
  /** Actual attacks/releases from MuseScore's MPE renderers, including ornaments. */
  performance?: {source: 'musescore-mpe'; events: NativePerformanceNote[]};
  cursorSegments?: { measure: number; tick: number; endTick: number; x: number; endX: number }[];
  timeMap?: { occurrence: number; tick: number; atMs: number }[];
  tempos?: { occurrence: number; atMs: number; quarterBpm: number }[];
  unsupported?: {
    kind: 'arpeggio' | 'ornament' | 'grace' | 'pause';
    measure: number;
    staff?: number;
    voice?: number;
  }[];
  dynamics?: {
    tick: number;
    track: number;
    type: number;
    text: string;
    velocity: number;
    changeInVelocity: number;
    velocityChangeTicks: number;
    speed: number;
    play: boolean;
  }[];
  durationReference?: 'musescore-midi';
  keyReleases?: {
    anchor: string;
    pitch: number;
    velocity?: number;
    utick: number;
    endUtick: number;
    atMs: number;
    endMs: number;
  }[];
  pedals?: {
    id: number;
    partId: string;
    occurrence: number;
    tick: number;
    endTick: number;
    atMs: number;
    endMs: number;
  }[];
}

/** Native does not supply app project identity or the content fingerprint. */
export interface NativeScoreData
  extends Omit<ScoreSnapshot, 'projectId' | 'fingerprint' | 'staves'> {
  staves: (ScoreStaff & { instruments: StaffInstrument[] })[];
  beats: (ScoreSnapshot['beats'][number] & { beatQuarter: number })[];
  cursorSegments: NonNullable<ScoreSnapshot['cursorSegments']>;
  timeMap: NonNullable<ScoreSnapshot['timeMap']>;
  tempos: NonNullable<ScoreSnapshot['tempos']>;
  unsupported: NonNullable<ScoreSnapshot['unsupported']>;
  durationReference: 'musescore-midi';
  performance: NonNullable<ScoreSnapshot['performance']>;
  keyReleases: NonNullable<ScoreSnapshot['keyReleases']>;
  pedals: NonNullable<ScoreSnapshot['pedals']>;
}
export interface NativePracticeSnapshot extends NativeScoreData {}
export interface NativeScoreSemantics extends NativeScoreData {
  anchors: (Anchor & { spelling: number; userVelocity: number })[];
  rests: [number, number, number, number][];
  keys: [number, number, number][];
  slurs: [number, number, number, number][];
  dynamics: NonNullable<ScoreSnapshot['dynamics']>;
}
// Pure fidelity comparison also accepts historical test/persisted snapshots.
export type ScoreMusic = Omit<ScoreSnapshot, 'projectId' | 'fingerprint'> & {
  rests?: number[][];
  keys?: number[][];
  slurs?: number[][];
};
export { decodeNativePracticeSnapshot, decodeNativeScoreSemantics } from './native-decoder';
