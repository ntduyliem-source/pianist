export interface EditorPlaybackState {
  available: boolean;
  status: 'playing' | 'paused' | 'stopped';
  positionSeconds: number;
  durationSeconds: number;
  tempoMultiplier: number;
}
export interface PracticePlaybackState extends EditorPlaybackState {
  preparing: boolean;
  error: string;
  clockEpoch: number;
  notesRevision: number;
  rangeStartSeconds?: number;
  rangeEndSeconds?: number;
}
export interface PlaybackNoteSpan {
  anchor: string;
  occurrence: number;
  atMs: number;
  endMs: number;
}
export interface PlaybackNote {
  anchors: string[];
  pitch: number;
  atMs: number;
  endMs: number;
  spans: PlaybackNoteSpan[];
}
export interface PlaybackTimePoint {
  referenceMs: number;
  playbackMs: number;
}
export interface PlaybackNotes {
  source: 'musescore-mpe';
  revision: number;
  events: PlaybackNote[];
  timeMap: PlaybackTimePoint[];
}
export interface PlaybackFrame {
  epoch: number;
  sequenceId: number;
  tempoMultiplier: number;
  positionSeconds: number;
  status: 0 | 1 | 2;
  contextTime: number;
  outputContextTime: number;
}
export interface NativePracticeAudio {
  resume(): Promise<void>;
  preparePreview(signal?: AbortSignal): Promise<void>;
  previewMidi(status: number, data1: number, data2: number, performanceMs?: number): void;
  stopPreview(): void;
}
export interface NativeAudioDriver extends NativePracticeAudio {
  playbackFrame(epoch: number): PlaybackFrame | null;
}

export type NativeTextCallback =
  | 'onEditorPlayback'
  | 'onPracticePlayback'
  | 'onPracticePlaybackNotes'
  | 'onPreparedSnapshot'
  | 'onPreparedSemantics'
  | 'onScoreSemantics'
  | 'onPracticeSnapshot';
export type NativeBytesCallback = 'onProjectPrepared' | 'onProjectSerialized' | 'onXmlExported';
export type NativeCallbacks = Partial<
  Record<NativeTextCallback, (json: string) => void> &
    Record<NativeBytesCallback, (bytes: Uint8Array) => void>
>;
export interface NativeModule extends NativeCallbacks {
  HEAPU8?: Uint8Array;
  driver?: NativeAudioDriver;
}
export interface NativeApi {
  Module: NativeModule;
  loadScoreData(bytes: Uint8Array, filename: string): boolean;
  saveProject(): number;
  loadPracticeScore?(bytes: Uint8Array, filename: string): number;
  restorePracticeScore?(): number;
  serializeProject(): number;
  exportScore(format: string): number;
  dispatchAction(action: string): number;
  prepareProject(bytes: Uint8Array, filename: string, semantics?: boolean): number;
  preparePracticeSnapshot?(bytes: Uint8Array, filename: string): number;
  getScoreSemantics(): number;
  getPracticeSnapshot(): number;
  setPracticeActive(active: boolean): number;
  setUiTheme?(theme: 'light' | 'dark'): number;
  midiInput(status: number, data1: number, data2: number): number;
  startAudioProcessing(): Promise<void>;
  getEditorPlayback?(): number;
  editorPlayback?(command: string, value?: number): number;
  getPracticePlayback?(): number;
  getPracticePlaybackNotes?(): number;
  practicePlayback?(command: string, value?: number, end?: number): number;
}
