import type { ScoreSnapshot } from '../score-contracts/index';

export interface NativeApi {
  Module: any; loadScoreData(bytes: Uint8Array, filename: string): boolean; saveProject(): number;
  serializeProject(): number; exportScore(format: string): number; dispatchAction(action: string): number;
  getPracticeSnapshot(): number; setPracticeActive(active: boolean): number; midiInput(status: number, data1: number, data2: number): number;
  startAudioProcessing(): Promise<void>;
}
export class EngineBridge {
  readonly schemaVersion = 1;
  revision = 0; practiceActive = false; private request = 0;
  constructor(readonly api: NativeApi) {}
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
    const fingerprint = await hash({anchors: content, performed: raw.performed, occurrences: raw.occurrences, beats: raw.beats});
    if (request !== this.request || revision !== this.revision) throw Error('Đã hủy snapshot cũ.');
    return {...raw, projectId, fingerprint};
  }
  cancel(): void { ++this.request; }
  setPractice(active: boolean): void {
    if (this.practiceActive === active) return;
    if (!this.api.setPracticeActive(active)) throw Error('Không chuyển được chế độ editor.');
    this.practiceActive = active;
  }
}
