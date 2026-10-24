import {
  decodeNativePracticeSnapshot,
  decodeNativeScoreSemantics,
  type NativePracticeSnapshot,
  type NativeScoreSemantics,
  type ScoreSnapshot,
} from '../score-contracts';
import type {
  NativeApi,
  NativeTextCallback,
  NativeBytesCallback,
  NativeAudioDriver,
  EditorPlaybackState,
  PracticePlaybackState,
  PlaybackNotes,
  SamplePlayback,
} from './native-api';
import {
  decodeEditorPlayback,
  decodePracticePlayback,
  decodePlaybackNotes,
  requireNativeAudioDriver,
} from './playback-decoder';
export type {
  NativeApi,
  NativeModule,
  NativeAudioDriver,
  NativePracticeAudio,
  EditorPlaybackState,
  PracticePlaybackState,
  PlaybackNoteSpan,
  PlaybackNote,
  PlaybackTimePoint,
  PlaybackNotes,
  PlaybackFrame,
  SamplePlayback,
  SampleMidiEvent,
} from './native-api';
export { decodePlaybackFrame } from './playback-decoder';

export type AuditionCommand =
  | 'range'
  | 'play'
  | 'pause'
  | 'stop'
  | 'seek'
  | 'tempo'
  | 'loop'
  | 'reset';
export class EngineBridge {
  readonly schemaVersion = 1;
  revision = 0;
  practiceActive = false;
  private request = 0;
  constructor(readonly api: NativeApi) {}
  practiceAudio(): NativeAudioDriver {
    return requireNativeAudioDriver(this.api.Module.driver);
  }
  playbackState(): EditorPlaybackState {
    return decodeEditorPlayback(
      this.captureText(
        'onEditorPlayback',
        () => this.api.getEditorPlayback?.() ?? 0,
        'Không đọc được trạng thái phát nhạc MuseScore.',
      ),
    );
  }
  playback(command: 'play' | 'toggle' | 'pause' | 'stop' | 'seek' | 'tempo', value = 0): void {
    if (this.practiceActive || !this.api.editorPlayback?.(command, value))
      throw Error('MuseScore chưa sẵn sàng phát bài này.');
  }
  auditionState(): PracticePlaybackState {
    return decodePracticePlayback(
      this.captureText(
        'onPracticePlayback',
        () => this.api.getPracticePlayback?.() ?? 0,
        'Không đọc được trạng thái nghe MuseScore.',
      ),
    );
  }
  auditionNotes(): PlaybackNotes {
    return decodePlaybackNotes(
      this.captureText(
        'onPracticePlaybackNotes',
        () => this.api.getPracticePlaybackNotes?.() ?? 0,
        'Không đọc được lịch phát nốt MuseScore.',
      ),
    );
  }
  samplePlayback(speed: number): SamplePlayback {
    const json = this.captureText('onSamplePlayback',
      () => this.api.getSamplePlayback?.(speed) ?? 0, 'Không đọc được lịch piano. Hãy tải lại ứng dụng.');
    const result = decodePlaybackNotes(json) as SamplePlayback;
    if (!Array.isArray(result.midi) || result.midi.length > 500000 || result.midi.some(e =>
      !Number.isFinite(e.atMs) || !Number.isSafeInteger(e.channel) || e.channel < 0 ||
      ![8, 9, 11, 14].includes(e.opcode) || !Number.isSafeInteger(e.data1) ||
      e.data1 < 0 || e.data1 > 127 || !Number.isSafeInteger(e.data2) || e.data2 < 0 || e.data2 > 16383))
      throw Error('Lịch piano từ MuseScore không hợp lệ.');
    result.midi.sort((a,b) => a.atMs-b.atMs);
    return result;
  }
  audition(command: AuditionCommand, value = 0, end = 0): void {
    if (!this.practiceActive || !this.api.practicePlayback?.(command, value, end))
      throw Error('MuseScore chưa sẵn sàng nghe bài này.');
  }
  private captureText(callback: NativeTextCallback, call: () => number, message: string): string {
    const previous = this.api.Module[callback],
      revision = this.revision;
    let raw: unknown;
    // Native owns temporary projects and buffers until call() returns. Never
    // parse or throw through its synchronous callback: that skips C++ cleanup.
    this.api.Module[callback] = (value) => {
      raw = value;
    };
    try {
      const success = call();
      if (!success || typeof raw !== 'string') throw Error(message);
      if (revision !== this.revision)
        throw Error('Bản nhạc thay đổi trong lúc xử lý. Hãy thử lại.');
      return raw;
    } finally {
      this.api.Module[callback] = previous;
    }
  }
  private captureBytes(
    callback: NativeBytesCallback,
    call: () => number,
    message: string,
  ): Uint8Array {
    const previous = this.api.Module[callback],
      revision = this.revision;
    let result: Uint8Array | undefined,
      failed = false,
      failure: unknown;
    this.api.Module[callback] = (value) => {
      // The WASM view expires before return. Copy here, but defer even a copy
      // failure until native has released its allocations and temporary score.
      try {
        if (!(value instanceof Uint8Array)) throw Error(message);
        result = new Uint8Array(value);
      } catch (error) {
        failed = true;
        failure = error;
      }
    };
    try {
      const success = call();
      if (failed) throw failure;
      if (!success || !result) throw Error(message);
      if (revision !== this.revision)
        throw Error('Bản nhạc thay đổi trong lúc xử lý. Hãy thử lại.');
      return result;
    } finally {
      this.api.Module[callback] = previous;
    }
  }
  prepare(bytes: Uint8Array, filename: string): Uint8Array {
    return this.captureBytes(
      'onProjectPrepared',
      () => this.api.prepareProject(bytes, filename),
      'MuseScore không chuẩn bị được bài này (MSCZ tối đa 32 MiB).',
    );
  }
  /** Editor-only synchronous oracle. Use ExerciseRenderer.prepare during timed play. */
  preparedSnapshot(bytes: Uint8Array, filename: string): NativePracticeSnapshot {
    const json = this.captureText(
      'onPreparedSnapshot',
      () => this.api.preparePracticeSnapshot?.(bytes, filename) ?? 0,
      'MuseScore chưa tạo được hình và nốt cho câu tập tạm.',
    );
    return decodeNativePracticeSnapshot(json, this.revision);
  }
  musicXml(): Uint8Array {
    return this.captureBytes(
      'onXmlExported',
      () => this.api.exportScore('musicxml'),
      'Không lấy được MusicXML đang chỉnh sửa.',
    );
  }
  semantics(bytes?: Uint8Array, filename = 'roundtrip.musicxml'): NativeScoreSemantics {
    const json = this.captureText(
      bytes ? 'onPreparedSemantics' : 'onScoreSemantics',
      () => (bytes ? this.api.prepareProject(bytes, filename, true) : this.api.getScoreSemantics()),
      'Không lấy được dữ liệu nhạc để đối chiếu ABC. Hãy xuất MXL hoặc MSCZ.',
    );
    return decodeNativeScoreSemantics(json, this.revision);
  }
  serialize(): Uint8Array {
    return this.captureBytes(
      'onProjectSerialized',
      () => this.api.serializeProject(),
      'MuseScore chưa tạo được bản lưu.',
    );
  }
  snapshot(): NativePracticeSnapshot {
    if (this.practiceActive && this.api.practicePlayback) this.audition('reset');
    const json = this.captureText(
      'onPracticeSnapshot',
      () => this.api.getPracticeSnapshot(),
      'Không tạo được bản tập. Giới hạn: 40 trang, 50.000 nốt viết, 24 MiB hình SVG.',
    );
    return decodeNativePracticeSnapshot(json, this.revision);
  }
  async cancellableSnapshot(
    projectId: string,
    hash: (value: unknown) => Promise<string>,
  ): Promise<ScoreSnapshot> {
    const request = ++this.request,
      raw = this.snapshot(),
      revision = this.revision;
    const content = raw.anchors
      .map(
        ({
          id,
          pitch,
          tick,
          durationTicks,
          staff,
          track,
          voice,
          tieBack,
          play,
          articulations,
          arpeggio,
          arpeggioGroup,
        }) => ({
          id,
          pitch,
          tick,
          durationTicks,
          staff,
          track,
          voice,
          tieBack,
          play,
          articulations,
          arpeggio,
          arpeggioGroup,
        }),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    const fingerprint = await hash({
      anchors: content,
      performed: raw.performed,
      occurrences: raw.occurrences,
      beats: raw.beats,
      durationReference: raw.durationReference,
      keyReleases: raw.keyReleases,
      pedals: raw.pedals,
      tempos: raw.tempos,
      unsupported: raw.unsupported,
    });
    if (request !== this.request || revision !== this.revision) throw Error('Đã hủy snapshot cũ.');
    return { ...raw, projectId, fingerprint };
  }
  cancel(): void {
    ++this.request;
  }
  setPractice(active: boolean): void {
    if (this.practiceActive === active) return;
    // Native transition preserves the editor speed and restores written tempo
    // without scheduling the editor controller's asynchronous resume callback.
    if (!this.api.setPracticeActive(active)) throw Error('Không chuyển được chế độ editor.');
    this.practiceActive = active;
  }
}
