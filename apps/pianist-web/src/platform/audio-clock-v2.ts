import type { Timeline, MidiEvent } from '../../../../packages/practice-engine-v2';
import { tempoAt } from '../../../../packages/practice-engine-v2';

import type { NativePracticeAudio } from '../../../../packages/engine-bridge';
import { activatePlaybackAudio } from './audio-session';
export type { NativePracticeAudio } from '../../../../packages/engine-bridge';
export type NativePracticeAudioProvider = () => Promise<NativePracticeAudio>;

// One affine mapping from performance timestamps to Web Audio time per run.
// It never follows the player's tempo or silently adjusts calibration.
export class AudioClock {
  context?: AudioContext;
  private origin = 0;
  private audioMinusPerf = 0;
  private scheduled = new Set<number>();
  private nodes = new Set<AudioScheduledSourceNode>();
  private native?: NativePracticeAudio;
  private timeline?: Timeline;
  private resumeAt = 0;
  private count = 0;
  private countInBpm = 60;
  private source: 'output-timestamp' | 'audio-current-time' = 'audio-current-time';
  constructor(private readonly nativeAudio?: NativePracticeAudioProvider) {}
  get mapping() {
    return {
      originPerformanceMs: this.origin,
      audioMinusPerformanceSeconds: this.audioMinusPerf,
      source: this.source,
      resumeAtMs: this.resumeAt,
    };
  }
  get countInBeatMs() {
    return 60000 / this.countInBpm;
  }
  coherent() {
    if (!this.context) return false;
    const pair = this.context.getOutputTimestamp?.();
    const current =
      this.source === 'output-timestamp' && pair?.contextTime && pair.performanceTime
        ? pair.contextTime - pair.performanceTime / 1000
        : this.context.currentTime - performance.now() / 1000;
    return Math.abs(current - this.audioMinusPerf) <= 0.025;
  }
  get now() {
    return performance.now() - this.origin;
  }
  at(timestamp: number) {
    return timestamp - this.origin;
  }
  performanceAt(positionMs: number) {
    return this.origin + positionMs;
  }
  async start(timeline: Timeline, resumeAt = 0, signal?: AbortSignal) {
    activatePlaybackAudio();
    signal?.throwIfAborted();
    this.silence();
    const ctx = (this.context ??= new AudioContext({ latencyHint: 'interactive' }));
    await ctx.resume();
    signal?.throwIfAborted();
    if (this.nativeAudio) {
      this.native = await this.nativeAudio();
      signal?.throwIfAborted();
      await this.native.resume();
      signal?.throwIfAborted();
      await this.native.preparePreview(signal);
      signal?.throwIfAborted();
    }
    if (this.context !== ctx || ctx.state !== 'running')
      throw Error('Chưa bật được âm thanh. Bấm Bắt đầu lại.');
    let pair = ctx.getOutputTimestamp?.();
    // Web Audio returns zero timestamps before its first rendered block.
    // Wait for one 128-frame render quantum at the output before pinning the mapping;
    // sampling currentTime=0 here includes device startup delay in every beat.
    // https://www.w3.org/TR/webaudio-1.0/#dom-audiocontext-getoutputtimestamp
    const deadline = performance.now() + 2000;
    while (
      typeof ctx.getOutputTimestamp === 'function' &&
      (!pair?.contextTime || pair.contextTime < 128 / ctx.sampleRate || !pair.performanceTime)
    ) {
      signal?.throwIfAborted();
      if (this.context !== ctx || ctx.state !== 'running')
        throw Error('Khởi động âm thanh đã bị ngắt. Bấm Bắt đầu lại.');
      if (performance.now() >= deadline)
        throw Error('Thiết bị âm thanh chưa cung cấp đồng hồ đầu ra. Bấm Bắt đầu lại.');
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      pair = ctx.getOutputTimestamp();
    }
    signal?.throwIfAborted();
    if (this.context !== ctx || ctx.state !== 'running')
      throw Error('Khởi động âm thanh đã bị ngắt. Bấm Bắt đầu lại.');
    this.timeline = timeline;
    this.resumeAt = resumeAt;
    this.count = timeline.settings.countIn;
    this.countInBpm = tempoAt(timeline, resumeAt);
    this.source =
      pair?.contextTime && pair.performanceTime ? 'output-timestamp' : 'audio-current-time';
    this.audioMinusPerf =
      pair?.contextTime && pair.performanceTime
        ? pair.contextTime - pair.performanceTime / 1000
        : ctx.currentTime - performance.now() / 1000;
    this.origin = performance.now() + 160 + this.count * this.countInBeatMs - resumeAt;
    this.scheduled.clear();
    this.pump();
  }
  private audioTime(atMs: number) {
    return (atMs + this.origin) / 1000 + this.audioMinusPerf;
  }
  private sound(atMs: number, durationMs: number, pitch: number, volume: number) {
    const ctx = this.context!;
    const when = this.audioTime(atMs);
    if (when < ctx.currentTime - 0.01) return;
    const osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.frequency.value = 440 * Math.pow(2, (pitch - 69) / 12);
    osc.type = 'triangle';
    const start = Math.max(when, ctx.currentTime),
      end = start + Math.max(0.02, durationMs / 1000);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
    this.nodes.add(osc);
    osc.onended = () => {
      this.nodes.delete(osc);
      osc.disconnect();
      gain.disconnect();
    };
  }
  pump() {
    if (!this.timeline || !this.context) return;
    const t = this.timeline,
      now = this.now,
      horizon = now + 250;
    const beats = t.settings.mode === 'bpm' && t.settings.metronome ? t.clicks : [];
    for (let i = 0; i < this.count; i++) {
      const at = this.resumeAt - (this.count - i) * this.countInBeatMs,
        id = -1 - i;
      if (at <= horizon && !this.scheduled.has(id)) {
        this.scheduled.add(id);
        this.sound(at, 60, i === 0 ? 88 : 81, 0.12);
      }
    }
    // Binary-search the current audio horizon; long scores do not scan every note.
    const schedule = (items: { atMs: number }[], base: number, play: (i: number) => void) => {
      let lo = 0,
        hi = items.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (items[mid].atMs < Math.max(this.resumeAt, now - 100)) lo = mid + 1;
        else hi = mid;
      }
      for (let i = lo; i < items.length && items[i].atMs <= horizon; i++)
        if (!this.scheduled.has(base + i)) {
          this.scheduled.add(base + i);
          play(i);
        }
    };
    schedule(beats, 0, (i) => this.sound(beats[i].atMs, 45, beats[i].accent ? 88 : 81, 0.09));
    schedule(t.guide, 1000000, (i) => {
      const n = t.guide[i];
      this.native?.previewMidi(0x9f, n.pitch, n.velocity ?? 90, this.performanceAt(n.atMs));
      this.native?.previewMidi(0x8f, n.pitch, 0, this.performanceAt(n.releaseMs ?? n.endMs));
    });
  }
  monitor(event: MidiEvent) {
    if (event.source !== 'virtual') return;
    if (event.kind === 'pedal') {
      this.native?.previewMidi(
        0xb0 | event.channel,
        64,
        this.timeline?.settings.pedalEnabled === false || event.synthetic ? 0 : event.value,
      );
    } else if (!event.stateOnly)
      this.native?.previewMidi(
        (event.kind === 'on' ? 0x90 : 0x80) | event.channel,
        event.pitch,
        event.kind === 'on' ? event.value : 0,
      );
  }
  // MuseScore's FluidSynth handles key release, sustain and re-strike. Only
  // the metronome above uses an oscillator; it is never used as a piano voice.
  tone(pitch: number, on: boolean, channel = 0, force = false) {
    if (force) this.native?.previewMidi(0xb0 | channel, 64, 0);
    this.native?.previewMidi((on ? 0x90 : 0x80) | channel, pitch, on ? 90 : 0);
  }
  silence() {
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {}
    }
    this.nodes.clear();
    this.native?.stopPreview();
    this.timeline = undefined;
  }
  async dispose() {
    this.silence();
    await this.context?.close();
    this.context = undefined;
  }
}
