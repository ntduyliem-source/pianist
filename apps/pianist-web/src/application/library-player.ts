import type { EngineBridge } from '../../../../packages/engine-bridge';
import {
  NativeAudition,
  type Audition,
  type AuditionRange,
  type AuditionState,
} from '../practice/native-audition';
import { activatePlaybackAudio } from '../platform/audio-session';

export interface LibraryTrack {
  id: string;
  title: string;
  version: string;
  load(signal: AbortSignal): Promise<{ bytes: Uint8Array; filename: string }>;
}
export interface LibraryPlayerState {
  track?: LibraryTrack;
  loading: boolean;
  status: 'playing' | 'paused' | 'stopped';
  positionMs: number;
  durationMs: number;
  error: string;
}
type Options = {
  activate?(): void;
  audition?(bridge: EngineBridge, range: AuditionRange): Audition;
  prepare(
    data: { bytes: Uint8Array; filename: string },
    signal: AbortSignal,
  ): Promise<EngineBridge>;
  restore(): void;
};
/** One audition owner for the library; each output supplies its audible clock. */
export class LibraryPlayer {
  private state: LibraryPlayerState = {
    loading: false,
    status: 'stopped',
    positionMs: 0,
    durationMs: 0,
    error: '',
  };
  private activity = { id: '', loading: false, status: 'stopped' as LibraryPlayerState['status'] };
  private listeners = new Set<() => void>();
  private statusListeners = new Set<() => void>();
  private request?: AbortController;
  private preview?: Audition;
  private native?: AuditionState;
  snapshot = () => this.state;
  activitySnapshot = () => this.activity;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  subscribeActivity = (fn: () => void) => {
    this.statusListeners.add(fn);
    return () => {
      this.statusListeners.delete(fn);
    };
  };
  constructor(private readonly options: Options) {}
  private patch(patch: Partial<LibraryPlayerState>) {
    this.state = { ...this.state, ...patch };
    const activity = {
      id: this.state.track?.id ?? '',
      loading: this.state.loading,
      status: this.state.status,
    };
    if (
      Object.keys(activity).some(
        (key) =>
          activity[key as keyof typeof activity] !== this.activity[key as keyof typeof activity],
      )
    ) {
      this.activity = activity;
      this.statusListeners.forEach((fn) => fn());
    }
    this.listeners.forEach((fn) => fn());
  }
  async play(track: LibraryTrack): Promise<void> {
    this.options.activate?.();
    activatePlaybackAudio();
    if (this.state.track?.id === track.id && this.preview && this.native) {
      const preview = this.preview;
      try {
        await preview.toggle(this.native);
      } catch (error) {
        if (this.preview === preview) this.fail(error);
      }
      return;
    }
    this.stop();
    const request = (this.request = new AbortController());
    const timeout = setTimeout(() => {
      if (this.request === request && this.state.loading)
        this.fail(Error('Chuẩn bị bài quá lâu. Bấm Thử lại; không cần đổi bài.'));
    }, 90000);
    this.patch({ track, loading: true, error: '', positionMs: 0, durationMs: 0 });
    try {
      const data = await track.load(request.signal);
      request.signal.throwIfAborted();
      const bridge = await this.options.prepare(data, request.signal);
      request.signal.throwIfAborted();
      // totalPlayTime includes the synthesizer's trailing release. The range
      // API accepts score time: use the last performed native measure instead.
      const durationMs = bridge.semantics().occurrences.at(-1)?.endMs ?? 0;
      if (!(durationMs > 0)) throw Error('Bản nhạc chưa có nội dung để nghe.');
      const preview = (this.preview = (
        this.options.audition ?? ((b, r) => new NativeAudition(b, r))
      )(bridge, {
        startMs: 0,
        endMs: durationMs,
      }));
      preview.onChange = (state) => {
        if (this.preview !== preview || request.signal.aborted) return;
        this.native = state;
        this.patch({
          loading: state.preparing,
          status: state.status,
          positionMs: state.positionMs,
          durationMs,
        });
      };
      preview.onError = (error) => {
        if (this.preview === preview) this.fail(error);
      };
      await preview.start(1, false);
    } catch (error) {
      if (this.request === request && !request.signal.aborted) this.fail(error);
    } finally {
      clearTimeout(timeout);
    }
  }
  private fail(error: unknown) {
    const track = this.state.track;
    this.stop();
    this.patch({ track, error: error instanceof Error ? error.message : String(error) });
  }
  toggle() {
    return this.state.track ? this.play(this.state.track) : Promise.resolve();
  }
  seek(ms: number) {
    this.preview?.seek(Math.max(0, Math.min(this.state.durationMs, ms)));
  }
  pause() {
    // Before an audition exists there is nothing to pause: cancel the load.
    // Once created, its pause() cancels pending play while retaining the song
    // and position, including an interruption during native preparation.
    if (this.state.loading && !this.preview) {
      this.stop();
      return;
    }
    this.preview?.pause();
  }
  stop() {
    const owned = !!this.request || !!this.preview;
    this.request?.abort();
    this.request = undefined;
    const preview = this.preview;
    this.preview = undefined;
    this.native = undefined;
    try {
      preview?.stop();
    } finally {
      if (owned) this.options.restore();
      this.patch({
        track: undefined,
        loading: false,
        status: 'stopped',
        positionMs: 0,
        durationMs: 0,
        error: '',
      });
    }
  }
}
