import type { EngineBridge } from '../../../../packages/engine-bridge';
import { SampleAudition } from '../practice/sample-audition';
import type { Audition, AuditionRange, AuditionState } from '../practice/native-audition';
import { mapPlaybackTime } from '../practice/playback-time';
import { bounded, soundSnapshot, unlockSound } from '../platform/audio-output';

export type EditorCommand = 'toggle' | 'play' | 'pause' | 'seek' | 'tempo' | 'stop';

/** One sample transport for the editor. Ranges stay in native reference time;
 * controls/cursor use performed seconds from the same native tempo map. */
export class EditorAudition {
  private preview?: Audition;
  private bridge?: EngineBridge;
  private state?: AuditionState;
  private listeners = new Set<() => void>();
  private generation = 0;
  private revision = -1;
  private pendingSeek?: { bridge: EngineBridge; seconds: number };
  constructor(
    private readonly create: (bridge: EngineBridge, range: AuditionRange) => Audition = (b, r) =>
      new SampleAudition(b, r),
  ) {}
  snapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  async toggle(bridge: EngineBridge) {
    unlockSound();
    if (this.preview && this.state && this.bridge === bridge && this.revision === bridge.revision) {
      await this.preview.toggle(this.state);
      return;
    }
    const seek = this.pendingSeek?.bridge === bridge ? this.pendingSeek.seconds : 0;
    this.stop();
    const generation = ++this.generation;
    const speed = bridge.playbackState().tempoMultiplier;
    const source = bridge.samplePlayback(speed);
    const endMs = source.timeMap.at(-1)?.referenceMs ?? 0;
    if (!(endMs > 0)) throw Error('Bản nhạc chưa có nội dung để nghe.');
    const preview = (this.preview = this.create(bridge, { startMs: 0, endMs }));
    this.bridge = bridge;
    this.revision = bridge.revision;
    preview.onChange = (state) => {
      if (this.preview !== preview) return;
      const positionSeconds = mapPlaybackTime(state.timeMap, state.positionMs, false) / 1000;
      this.state = {
        ...state,
        positionSeconds,
        durationSeconds: mapPlaybackTime(state.timeMap, endMs, false) / 1000,
      };
      bridge.api.sampleEditorPosition?.(positionSeconds, state.sounding);
      this.listeners.forEach((fn) => fn());
    };
    preview.onError = (error) => {
      if (this.preview !== preview) return;
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
      // SampleAudition's first preparing notification precedes its note load.
      // Seed that notification with the exact native map read above.
      const changed = preview.onChange;
      preview.onChange = (state) =>
        changed(state.timeMap.length ? state : { ...state, timeMap: source.timeMap });
      if (seek > 0) preview.seek(mapPlaybackTime(source.timeMap, seek * 1000));
      await preview.start(speed, false);
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      throw error;
    }
  }
  async play(bridge: EngineBridge) {
    if (this.preview && this.state?.status === 'playing') return;
    await this.toggle(bridge);
  }
  seek(seconds: number, bridge?: EngineBridge) {
    if (this.preview && this.state && (!bridge || this.bridge === bridge))
      this.preview.seek(mapPlaybackTime(this.state.timeMap, seconds * 1000));
    else if (bridge) this.pendingSeek = { bridge, seconds };
  }
  speed(value: number) {
    this.preview?.speed(value);
  }
  pause() {
    this.preview?.pause();
  }
  stop() {
    this.generation++;
    this.bridge?.api.sampleEditorPosition?.(0, false);
    this.preview?.stop();
    this.preview = undefined;
    this.bridge = undefined;
    this.pendingSeek = undefined;
    this.state = undefined;
    this.listeners.forEach((fn) => fn());
  }
}
export const editorAudition = new EditorAudition();
let nativeGeneration = 0;
const sampleOwners = new WeakSet<EngineBridge>();

/** Qt toolbar, shortcuts and the React controls all send commands to this owner. */
export function bindEditorPlayback(bridge: EngineBridge, onError: (error: unknown) => void) {
  const sampled = soundSnapshot() === 'piano';
  if (sampled) sampleOwners.add(bridge);
  else sampleOwners.delete(bridge);
  const previous = bridge.api.Module.onEditorPlaybackCommand;
  let bound = true;
  const callback = (command: string, value: number) => {
    if (
      !['toggle', 'play', 'pause', 'stop', 'seek', 'tempo'].includes(command) ||
      !Number.isFinite(value)
    )
      return;
    // Leave the native action stack before querying its score/tempo data.
    queueMicrotask(() => {
      if (bound && !bridge.practiceActive)
        void editorCommand(bridge, command as EditorCommand, value).catch(onError);
    });
  };
  bridge.api.Module.onEditorPlaybackCommand = callback;
  bridge.api.editorPlayback?.('output', Number(sampled));
  return () => {
    bound = false;
    stopEditorPlayback(bridge);
    sampleOwners.delete(bridge);
    bridge.api.editorPlayback?.('output', 0);
    if (bridge.api.Module.onEditorPlaybackCommand === callback)
      bridge.api.Module.onEditorPlaybackCommand = previous;
  };
}

export function stopEditorPlayback(bridge?: EngineBridge) {
  nativeGeneration++;
  editorAudition.stop();
  // This remains valid while native notation is null/practice owns the engine.
  bridge?.api.sampleEditorPosition?.(0, false);
  // A sample-owned Qt Stop is already handled above; dispatching it again
  // would feed the same command back through the native toolbar callback.
  if (bridge && !sampleOwners.has(bridge) && bridge.playbackState().available)
    bridge.api.editorPlayback?.('stop');
}
export async function editorCommand(bridge: EngineBridge, command: EditorCommand, value = 0) {
  if (command === 'stop') {
    stopEditorPlayback(bridge);
    return;
  }
  if (soundSnapshot() === 'piano') {
    if (command === 'seek') editorAudition.seek(value, bridge);
    else if (command === 'pause') editorAudition.pause();
    else if (command === 'tempo') editorAudition.speed(value);
    else if (command === 'play') await editorAudition.play(bridge);
    else await editorAudition.toggle(bridge);
    return;
  }
  const generation = ++nativeGeneration;
  if (command === 'pause' || command === 'tempo') {
    if (bridge.playbackState().available) bridge.playback(command, value);
    return;
  }
  unlockSound();
  try {
    if (command === 'toggle' || command === 'play') {
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
