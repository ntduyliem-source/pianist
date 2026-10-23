export const SCHEMA_VERSION = 1;
export interface Box {x: number; y: number; width: number; height: number}
export interface Anchor {id: string; pitch: number; tick: number; durationTicks: number; measure: number; staff: number; visualStaff: number; track: number; voice: number; page: number; visible: boolean; play: boolean; box: Box; tieBack?: string; articulations?: string[]; arpeggio?: 'up' | 'down'; arpeggioGroup?: string; userVelocity?:number}
export interface ScorePage {index: number; width: number; height: number; displayWidth: number; offsetX: number; offsetY: number; svg: string}
export interface Measure {index: number; label: number; tick: number; endTick: number; page: number; box: Box; numerator: number; denominator: number}
export interface Occurrence {index: number; measure: number; startMs: number; endMs: number; utick: number}
export interface ScoreSnapshot {
  schemaVersion: 1; projectId: string; revision: number; fingerprint: string; title: string; baseQuarterBpm: number; durationMs: number;
  staves: {id: number; part: string; partId: string}[]; pages: ScorePage[]; measures: Measure[]; anchors: Anchor[];
  occurrences: Occurrence[]; performed: {anchor: string; occurrence: number; atMs: number; endMs: number}[];
  beats: {atMs: number; accent: boolean; occurrence: number; beatQuarter?: number}[]; warnings: string[];
  cursorSegments?: {measure:number;tick:number;endTick:number;x:number;endX:number}[];
  timeMap?: {occurrence:number;tick:number;atMs:number}[];
  tempos?: {occurrence:number;atMs:number;quarterBpm:number}[];
  unsupported?: {kind:'arpeggio'|'ornament'|'grace'|'pause';measure:number;staff?:number;voice?:number}[];
  dynamics?: {tick:number;track:number;type:number;text:string;velocity:number;changeInVelocity:number;velocityChangeTicks:number;speed:number;play:boolean}[];
  durationReference?: 'musescore-midi';
  keyReleases?: {anchor:string; pitch:number; velocity?:number; utick:number; endUtick:number; atMs:number; endMs:number}[];
  pedals?: {id:number; partId:string; occurrence:number; tick:number; endTick:number; atMs:number; endMs:number}[];
}
