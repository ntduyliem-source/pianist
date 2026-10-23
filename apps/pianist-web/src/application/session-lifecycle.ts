import type {
  AttemptResult,
  AttemptStatus,
  MidiEvent,
  Timeline,
} from '../../../../packages/practice-engine-v2/model';
import type { NativePracticeAudioProvider } from '../platform/audio-clock-v2';
import { PracticeController } from '../practice/controller-v2';

export interface SessionHandle {
  status: AttemptStatus;
  onChange: () => void;
  dispose(): void;
}

/** Owns one session. Frame listeners are intentionally separate from app navigation. */
export class SessionLifecycle<T extends SessionHandle> {
  private value?: T;
  private version = 0;
  private status: AttemptStatus | 'idle' = 'idle';
  private views = new Set<() => void>();
  private statuses = new Set<() => void>();
  private detach?: () => void;

  get current(): T | undefined {
    return this.value;
  }
  get active(): boolean {
    return !!this.value && !['ready', 'finished'].includes(this.value.status);
  }
  snapshot = () => this.version;
  statusSnapshot = () => this.status;
  subscribe = (listener: () => void) => {
    this.views.add(listener);
    return () => this.views.delete(listener);
  };
  subscribeStatus = (listener: () => void) => {
    this.statuses.add(listener);
    return () => this.statuses.delete(listener);
  };

  requireIdle(message = 'Kết thúc lượt tập trước khi mở hoặc đổi bản nhạc.'): void {
    if (this.active) throw Error(message);
  }

  install(next: T): T {
    if (this.value === next) return next;
    this.requireIdle();
    this.dispose(this.value);
    if (this.value) throw Error('Lượt tập đã thay đổi trong lúc dọn lượt cũ.');
    this.value = next;
    const previous = next.onChange;
    const changed = () => {
      if (this.value !== next) return;
      previous?.();
      this.publish();
    };
    next.onChange = changed;
    this.detach = () => {
      if (next.onChange === changed) next.onChange = previous;
    };
    this.publish();
    return next;
  }

  /** An old screen/async operation cannot dispose a replacement session. */
  dispose(expected: T | undefined): boolean {
    if (!expected || this.value !== expected) return false;
    this.detach?.();
    this.detach = undefined;
    this.value = undefined;
    try {
      expected.dispose();
    } finally {
      this.publish();
    }
    return true;
  }

  private publish(): void {
    this.version++;
    const status = this.value?.status ?? 'idle';
    if (status !== this.status) {
      this.status = status;
      this.statuses.forEach((listener) => listener());
    }
    this.views.forEach((listener) => listener());
  }
}

export class PracticeSessions extends SessionLifecycle<PracticeController> {
  create(options: {
    timeline: Timeline;
    title: string;
    nativeAudio: NativePracticeAudioProvider;
    onComplete: (result: AttemptResult) => void;
    onChange?: (session: PracticeController) => void;
  }): PracticeController {
    this.requireIdle();
    const controller = new PracticeController(options.timeline, options.title, options.nativeAudio);
    if (options.onChange)
      controller.onChange = () => {
        if (this.current === controller) options.onChange!(controller);
      };
    this.install(controller);
    this.setCompletion(controller, options.onComplete);
    return controller;
  }

  setCompletion(expected: PracticeController, complete: (result: AttemptResult) => void): void {
    if (this.current !== expected) return;
    expected.onComplete = (result) => {
      if (this.current === expected) complete(result);
    };
  }

  async start(expected: PracticeController, initialState: () => MidiEvent[]): Promise<void> {
    if (this.current !== expected) throw new DOMException('Đã đổi lượt tập.', 'AbortError');
    try {
      await expected.start(initialState);
    } catch (error) {
      // Controller startup can dispose itself without another onChange. Always
      // publish the owner's cleanup, never clean up a replacement session.
      this.dispose(expected);
      throw error;
    }
  }
}
