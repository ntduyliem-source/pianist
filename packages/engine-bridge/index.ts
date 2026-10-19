import type { ScoreSnapshot } from '../score-contracts/index';

export interface NativeApi {
  Module: any; loadScoreData(bytes: Uint8Array, filename: string): boolean; saveProject(): number;
  serializeProject(): number; exportScore(format: string): number; dispatchAction(action: string): number;
  prepareProject(bytes: Uint8Array, filename: string, semantics?: boolean): number;
  getScoreSemantics(): number;
  getPracticeSnapshot(): number; setPracticeActive(active: boolean): number; midiInput(status: number, data1: number, data2: number): number;
  startAudioProcessing(): Promise<void>;
  getEditorPlayback?(): number;
  editorPlayback?(command: string, value?: number): number;
}
export interface EditorPlaybackState {
  available: boolean; status: 'playing' | 'paused' | 'stopped';
  positionSeconds: number; durationSeconds: number; tempoMultiplier: number;
}
export class EngineBridge {
  readonly schemaVersion = 1;
  revision = 0; practiceActive = false; private request = 0; private editorTempo = 1;
  constructor(readonly api: NativeApi) {}
  playbackState(): EditorPlaybackState {
    return this.capture('onEditorPlayback', () => this.api.getEditorPlayback?.() ?? 0,
      value => JSON.parse(value), 'Không đọc được trạng thái phát nhạc MuseScore.');
  }
  playback(command: 'play'|'toggle'|'pause'|'stop'|'seek'|'tempo', value = 0): void {
    if (this.practiceActive || !this.api.editorPlayback?.(command, value)) throw Error('MuseScore chưa sẵn sàng phát bài này.');
  }
  private capture<T>(callback: string, call: () => number, copy: (value: any) => T, message: string): T {
    const previous = this.api.Module[callback], revision = this.revision;
    let result: T | undefined;
    this.api.Module[callback] = (value: any) => {result = copy(value);};
    try {
      if (!call() || result === undefined) throw Error(message);
      if (revision !== this.revision) throw Error('Bản nhạc thay đổi trong lúc xử lý. Hãy thử lại.');
      return result;
    } finally {this.api.Module[callback] = previous;}
  }
  prepare(bytes: Uint8Array, filename: string): Uint8Array {
    return this.capture('onProjectPrepared', () => this.api.prepareProject(bytes, filename), value => new Uint8Array(value), 'MuseScore không chuẩn bị được bài này (MSCZ tối đa 32 MiB).');
  }
  musicXml(): Uint8Array {
    return this.capture('onXmlExported', () => this.api.exportScore('musicxml'), value => new Uint8Array(value), 'Không lấy được MusicXML đang chỉnh sửa.');
  }
  semantics(bytes?: Uint8Array, filename = 'roundtrip.musicxml'): ScoreSnapshot {
    return this.capture(bytes ? 'onPreparedSemantics' : 'onScoreSemantics',
      () => bytes ? this.api.prepareProject(bytes, filename, true) : this.api.getScoreSemantics(),
      value => JSON.parse(value), 'Không lấy được dữ liệu nhạc để đối chiếu ABC. Hãy xuất MXL hoặc MSCZ.');
  }
  serialize(): Uint8Array {
    let result: Uint8Array | undefined;
    this.api.Module.onProjectSerialized = (bytes: Uint8Array) => { result = new Uint8Array(bytes); };
    try { if (!this.api.serializeProject() || !result) throw Error('MuseScore chưa tạo được bản lưu.'); return result; }
    finally { this.api.Module.onProjectSerialized = undefined; }
  }
  snapshot(): Omit<ScoreSnapshot, 'projectId' | 'fingerprint'> {
    let result: Omit<ScoreSnapshot, 'projectId' | 'fingerprint'> | undefined;
    this.api.Module.onPracticeSnapshot = (json: string) => {result = JSON.parse(json);};
    try {
      if (!this.api.getPracticeSnapshot() || !result) throw Error('Không tạo được bản tập. Giới hạn: 40 trang, 50.000 nốt viết, 24 MiB hình SVG.');
      if (result.schemaVersion !== this.schemaVersion || result.revision !== this.revision) throw Error('Bản nhạc đã thay đổi trong lúc tạo dữ liệu tập. Hãy mở Tập piano lại.');
      return result;
    } finally { this.api.Module.onPracticeSnapshot = undefined; }
  }
  async cancellableSnapshot(projectId: string, hash: (value: unknown) => Promise<string>): Promise<ScoreSnapshot> {
    const request = ++this.request, raw = this.snapshot(), revision = this.revision;
    const content = raw.anchors.map(({id, pitch, tick, durationTicks, staff, track, voice, tieBack, play, articulations, arpeggio, arpeggioGroup}) =>
      ({id, pitch, tick, durationTicks, staff, track, voice, tieBack, play, articulations, arpeggio, arpeggioGroup})).sort((a, b) => a.id.localeCompare(b.id));
    const fingerprint = await hash({anchors: content, performed: raw.performed, occurrences: raw.occurrences, beats: raw.beats,
      durationReference:raw.durationReference,keyReleases:raw.keyReleases,pedals:raw.pedals});
    if (request !== this.request || revision !== this.revision) throw Error('Đã hủy snapshot cũ.');
    return {...raw, projectId, fingerprint};
  }
  cancel(): void { ++this.request; }
  setPractice(active: boolean): void {
    if (this.practiceActive === active) return;
    // MuseScore's playback speed changes its tempo map. Practice snapshots must
    // use the written tempo; keep the editor's speed separate from grading.
    if (active && this.api.getEditorPlayback && this.api.editorPlayback) {
      this.editorTempo = this.playbackState().tempoMultiplier;
      this.api.editorPlayback('stop');
      if (this.editorTempo !== 1) this.playback('tempo', 1);
    }
    if (!this.api.setPracticeActive(active)) throw Error('Không chuyển được chế độ editor.');
    this.practiceActive = active;
    if (!active && this.editorTempo !== 1) this.api.editorPlayback?.('tempo', this.editorTempo);
  }
}
