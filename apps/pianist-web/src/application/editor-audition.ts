import type { EngineBridge } from '../../../../packages/engine-bridge';
import { SampleAudition } from '../practice/sample-audition';
import type { AuditionState } from '../practice/native-audition';
import { bounded, soundSnapshot, unlockSound } from '../platform/audio-output';

export class EditorAudition {
  private preview?: SampleAudition;
  private state?: AuditionState;
  private listeners = new Set<() => void>();
  private generation = 0;
  private revision = -1;
  snapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  async toggle(bridge: EngineBridge) {
    unlockSound();
    if (this.preview && this.state && this.revision === bridge.revision) {
      await this.preview.toggle();
      return;
    }
    this.stop();
    const generation = ++this.generation;
    const data = bridge.semantics();
    const endMs = data.occurrences.at(-1)?.endMs ?? 0;
    if (!endMs) throw Error('Bản nhạc chưa có nội dung để nghe.');
    const preview = (this.preview = new SampleAudition(bridge, { startMs: 0, endMs }));
    this.revision = bridge.revision;
    preview.onChange = (state) => {
      if (this.preview !== preview) return;
      this.state = state;
      this.listeners.forEach((fn) => fn());
      bridge.api.sampleEditorPosition?.(state.positionMs / 1000, state.sounding);
    };
    preview.onError = (error) => {
      const previous = this.state;
      this.stop();
      if (previous)
        this.state = {
          ...previous,
          status: 'stopped',
          sounding: false,
          error: String(error instanceof Error ? error.message : error),
        };
      this.listeners.forEach((fn) => fn());
    };
    try {
      await preview.start(1, false);
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      throw error;
    }
  }
  seek(seconds: number) {
    this.preview?.seek(seconds * 1000);
  }
  pause() {
    this.preview?.pause();
  }
  stop() {
    this.generation++;
    this.preview?.bridge.api.sampleEditorPosition?.(0, false);
    this.preview?.stop();
    this.preview = undefined;
    this.state = undefined;
    this.listeners.forEach((fn) => fn());
  }
}
export const editorAudition = new EditorAudition();
let nativeGeneration = 0;
export function stopEditorPlayback(bridge?: EngineBridge) {
  nativeGeneration++;
  editorAudition.stop();
  // A notation-only editor has no native player until optional audio is ready.
  if (bridge?.playbackState().available) bridge.api.editorPlayback?.('stop');
}
export async function editorCommand(
  bridge: EngineBridge,
  command: 'toggle' | 'seek' | 'stop',
  value = 0,
) {
  unlockSound();
  if (command === 'stop') {
    stopEditorPlayback(bridge);
    return;
  }
  if (soundSnapshot() === 'piano') {
    if (command === 'seek') editorAudition.seek(value);
    else await editorAudition.toggle(bridge);
    return;
  }
  const generation = ++nativeGeneration;
  try {
    if (command === 'toggle') {
      await bounded(
        bridge.api.startAudioProcessing(unlockSound()),
        60000,
        'Chưa tải được tiếng MuseScore. Bấm Nghe để thử lại.',
      );
      await bounded(bridge.api.Module.driver!.resume(), 5000, 'Chưa bật được âm thanh. Thử lại.');
      const deadline = performance.now() + 20000;
      while (!bridge.playbackState().available) {
        if (
          generation !== nativeGeneration ||
          soundSnapshot() !== 'musescore' ||
          bridge.practiceActive
        )
          return;
        if (performance.now() >= deadline)
          throw Error('MuseScore chưa chuẩn bị xong bài. Bấm Nghe để thử lại.');
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
  } catch (error) {
    if (generation !== nativeGeneration || soundSnapshot() !== 'musescore') return;
    throw error;
  }
  if (generation !== nativeGeneration || soundSnapshot() !== 'musescore' || bridge.practiceActive)
    return;
  bridge.api.Module.driver?.setMuted?.(false);
  bridge.playback(command, value);
}
