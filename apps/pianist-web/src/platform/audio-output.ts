import { activatePlaybackAudio } from './audio-session';

export type SoundMode = 'piano' | 'musescore';
let mode: SoundMode = 'piano';
try {
  if (localStorage.getItem('pianist.sound') === 'musescore') mode = 'musescore';
} catch {}
const listeners = new Set<() => void>();
export const soundSnapshot = () => mode;
export const subscribeSound = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export function setSoundMode(value: SoundMode) {
  if (value === mode) return;
  mode = value;
  try {
    localStorage.setItem('pianist.sound', value);
  } catch {}
  listeners.forEach((fn) => fn());
}

let context: AudioContext | undefined;
/** Call synchronously in the click/key handler, before fetching scores/samples. */
export function unlockSound(): AudioContext {
  activatePlaybackAudio();
  context ??= new AudioContext({ latencyHint: 'interactive' });
  void context.resume().catch(() => {});
  return context;
}
export async function resumeSound(): Promise<AudioContext> {
  const ctx = unlockSound();
  await bounded(ctx.resume(), 5000, 'Trình duyệt chưa bật âm thanh. Bấm Nghe để thử lại.');
  if (ctx.state !== 'running') throw Error('Âm thanh đang bị ngắt. Bấm Nghe để thử lại.');
  return ctx;
}
export function bounded<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(signal?.reason ?? new DOMException('Đã hủy.', 'AbortError'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(Error(message));
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
    if (signal?.aborted) abort();
  });
}
