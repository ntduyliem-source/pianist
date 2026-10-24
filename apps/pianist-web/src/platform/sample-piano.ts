import type { NativePracticeAudio, SampleMidiEvent } from '../../../../packages/engine-bridge';
import { bounded, resumeSound, unlockSound } from './audio-output';
import type { Piano } from '@tonejs/piano';
import type { Context } from 'tone';

type Tone = typeof import('tone');
let loading: Promise<{ tone: Tone; context: Context; piano: typeof Piano }> | undefined;
export function sampleRuntime() {
  const raw = unlockSound();
  loading ??= Promise.all([import('tone'), import('@tonejs/piano/build/piano/Piano')])
    .then(([tone, { Piano }]) => {
      const context = new tone.Context({ context: raw, lookAhead: 0.04, updateInterval: 0.01 });
      // Piano 0.2.1 creates its internal String Sampler using Tone's default context.
      tone.setContext(context);
      // Transport is an absolute millisecond carrier, not a second tempo map.
      // All score tempo changes/pauses have already been rendered by MuseScore.
      context.transport.bpm.value = 60;
      context.transport.PPQ = 1000;
      return { tone, context, piano: Piano };
    })
    .catch((error) => {
      loading = undefined;
      throw error;
    });
  return loading;
}

/** Sound generation and sustain/restrike semantics are @tonejs/piano's, not the scorer's. */
export class SamplePiano implements NativePracticeAudio {
  private instruments = new Map<number, Piano>();
  private ready?: Promise<void>;
  private context?: Context;
  private pending = new Set<number>();
  async resume() {
    await resumeSound();
  }
  async prepare(channels: number[], signal?: AbortSignal) {
    const runtime = await bounded(
      sampleRuntime(),
      15000,
      'Chưa tải được bộ piano nhẹ. Thử lại.',
      signal,
    );
    this.context = runtime.context;
    await this.resume();
    const added: Piano[] = [];
    try {
      for (const channel of new Set(channels)) {
        if (this.instruments.has(channel)) continue;
        const instrument = new runtime.piano({
          context: runtime.context,
          velocities: 1,
          url: new URL('sound/piano/', location.href).href,
          minNote: 21,
          maxNote: 108,
          pedal: false,
          release: false,
          maxPolyphony: 128,
        });
        instrument.toDestination();
        this.instruments.set(channel, instrument);
        added.push(instrument);
      }
      await bounded(
        Promise.all(added.map((p) => p.load())),
        30000,
        'Tải mẫu piano quá lâu. Kiểm tra mạng rồi bấm Nghe để thử lại, hoặc chọn Tiếng MuseScore.',
        signal,
      );
    } catch (error) {
      for (const [channel, piano] of this.instruments)
        if (added.includes(piano)) {
          piano.disconnect();
          piano.dispose();
          this.instruments.delete(channel);
        }
      throw error;
    }
  }
  async preparePreview(signal?: AbortSignal) {
    this.ready ??= this.prepare([0, 15], signal).catch((e) => {
      this.ready = undefined;
      throw e;
    });
    await bounded(this.ready, 35000, 'Chưa tải được piano. Thử lại.', signal);
  }
  event(event: SampleMidiEvent, time: number) {
    const p = this.instruments.get(event.channel);
    if (!p) return;
    const { opcode, data1, data2 } = event;
    if (opcode === 9 && data2 > 0) p.keyDown({ midi: data1, velocity: data2 / 127, time });
    else if (opcode === 8 || opcode === 9) p.keyUp({ midi: data1, time });
    else if (opcode === 11 && data1 === 64) {
      if (data2 >= 64) p.pedalDown({ time });
      else p.pedalUp({ time });
    } else if (opcode === 11 && (data1 === 120 || data1 === 123)) p.stopAll();
  }
  previewMidi(status: number, data1: number, data2: number, performanceMs = performance.now()) {
    const raw = unlockSound();
    const stamp = raw.getOutputTimestamp?.();
    const mapping =
      stamp?.contextTime && stamp.performanceTime
        ? stamp.contextTime - stamp.performanceTime / 1000
        : raw.currentTime -
          performance.now() / 1000 -
          (raw.baseLatency || 0) -
          (raw.outputLatency || 0);
    const time = Math.max(raw.currentTime, performanceMs / 1000 + mapping);
    const event = { opcode: status >> 4, channel: status & 15, data1, data2, atMs: 0 };
    const context = this.context;
    if (!context) return;
    // AudioClock sends guide note-off in advance. Piano's held-key state is
    // updated when called, so dispatch in Tone's chronological audio queue.
    // Channel 0 is the virtual keyboard; 15 is the independent guide voice.
    const id = context.setTimeout(
      () => {
        this.pending.delete(id);
        this.event(event, time);
      },
      Math.max(0, time - context.now()),
    );
    this.pending.add(id);
  }
  stopPreview() {
    for (const id of this.pending) this.context?.clearTimeout(id);
    this.pending.clear();
    for (const p of this.instruments.values()) p.stopAll();
  }
  release(time: number) {
    for (const p of this.instruments.values()) {
      p.pedalUp({ time });
      for (let midi = 21; midi <= 108; midi++) p.keyUp({ midi, time });
    }
  }
  dispose() {
    this.stopPreview();
    for (const p of this.instruments.values()) {
      p.disconnect();
      p.dispose();
    }
    this.instruments.clear();
  }
}

export const practicePiano = new SamplePiano();
