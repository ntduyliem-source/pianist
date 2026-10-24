import type {
  EngineBridge,
  SampleMidiEvent,
  SamplePlayback,
} from '../../../../packages/engine-bridge';
import { SamplePiano, sampleRuntime } from '../platform/sample-piano';
import { resumeSound } from '../platform/audio-output';
import type { Part, Context } from 'tone';
import type { Audition, AuditionRange, AuditionState } from './native-audition';
import { mapPlaybackTime } from './playback-time';

/** MIDI state chase for seeking: no score interpretation or grading here. */
export function chaseMidi(events: readonly SampleMidiEvent[], before: number): SampleMidiEvent[] {
  const notes = new Map<string, { event: SampleMidiEvent; held: boolean }>();
  const pedals = new Map<number, SampleMidiEvent>();
  for (const e of events) {
    if (e.atMs >= before) break;
    const key = `${e.channel}:${e.data1}`;
    if (e.opcode === 9 && e.data2 > 0) notes.set(key, { event: e, held: true });
    else if (e.opcode === 8 || e.opcode === 9) {
      const n = notes.get(key);
      if ((pedals.get(e.channel)?.data2 ?? 0) >= 64 && n) n.held = false;
      else notes.delete(key);
    } else if (e.opcode === 11 && e.data1 === 64) {
      pedals.set(e.channel, e);
      if (e.data2 < 64)
        for (const [key, n] of notes)
          if (n.event.channel === e.channel && !n.held) notes.delete(key);
    } else if (e.opcode === 11 && (e.data1 === 120 || e.data1 === 123)) {
      for (const [key, n] of notes) if (n.event.channel === e.channel) notes.delete(key);
    }
  }
  return [
    ...pedals.values(),
    ...[...notes.values()].flatMap((n) =>
      n.held ? [n.event] : [n.event, { ...n.event, opcode: 8, data2: 0 }],
    ),
  ].map((e) => ({ ...e, atMs: before }));
}

type MidiBatch = {
  events: SampleMidiEvent[];
  chase?: SampleMidiEvent[];
  initialChase?: SampleMidiEvent[];
};
export function auditionBatches(
  events: SampleMidiEvent[],
  start: number,
  end: number,
  from: number,
  looping: boolean,
) {
  const batches = new Map<number, MidiBatch>();
  batches.set(start, { events: [], chase: chaseMidi(events, start) });
  if (from > start) batches.set(from, { events: [], initialChase: chaseMidi(events, from) });
  for (const event of events)
    if (event.atMs >= start && event.atMs < end) {
      const batch = batches.get(event.atMs) ?? { events: [] };
      batch.events.push(event);
      batches.set(event.atMs, batch);
    }
  if (!looping) batches.set(end, { events: [], chase: [] });
  return batches;
}

export class SampleAudition implements Audition {
  onChange = (_state: AuditionState) => {};
  onError = (_error: unknown) => {};
  private piano = new SamplePiano();
  private part?: Part<[number, MidiBatch]>;
  private context?: Context;
  private notes?: SamplePlayback;
  private animation?: number;
  private disposed = false;
  private abort = new AbortController();
  private speedValue = 1;
  private looping = false;
  private status: AuditionState['status'] = 'stopped';
  private position: number;
  private segmentStart = 0;
  private segmentEnd = 0;
  private preparing = false;
  private generation = 0;
  private pausedBeforeReady = false;
  private requestedPlayback = false;
  private startsAt = Infinity;
  private audible = false;
  constructor(
    readonly bridge: EngineBridge,
    readonly range: AuditionRange,
  ) {
    this.position = range.startMs;
  }
  private emit() {
    const notes = this.notes;
    this.onChange({
      available: true,
      status: this.status,
      positionMs: this.position,
      positionSeconds: this.position / 1000,
      durationSeconds: this.range.endMs / 1000,
      elapsedMs: notes
        ? mapPlaybackTime(notes.timeMap, this.position, false) -
          mapPlaybackTime(notes.timeMap, this.range.startMs, false)
        : 0,
      tempoMultiplier: this.speedValue,
      preparing: this.preparing,
      error: '',
      clockEpoch: 0,
      notesRevision: notes?.revision ?? 0,
      notes: notes?.events ?? [],
      timeMap: notes?.timeMap ?? [],
      sounding: this.status === 'playing' && !this.preparing && this.audible,
    });
  }
  private refresh = () => {
    if (this.disposed) return;
    if (this.status === 'playing' && this.context && this.notes) {
      const raw = this.context.rawContext as AudioContext;
      if (raw.state !== 'running') {
        this.pause();
        this.animation = requestAnimationFrame(this.refresh);
        return;
      }
      const stamp = raw.getOutputTimestamp?.();
      const output =
        stamp?.contextTime ||
        Math.max(0, raw.currentTime - (raw.baseLatency || 0) - (raw.outputLatency || 0));
      // The transport is shared across songs. Until the scheduled start is
      // audible, it may still report the previous song's tail/stop position.
      if (output < this.startsAt) {
        this.emit();
        this.animation = requestAnimationFrame(this.refresh);
        return;
      }
      this.audible = true;
      const ms = this.context.transport.getSecondsAtTime(output) * 1000;
      this.position = Math.max(
        this.range.startMs,
        Math.min(this.range.endMs, mapPlaybackTime(this.notes.timeMap, ms)),
      );
      if (!this.looping && ms >= this.segmentEnd - 0.1) {
        this.pause();
        this.position = this.range.endMs;
        this.status = 'stopped';
      }
    }
    this.emit();
    this.animation = requestAnimationFrame(this.refresh);
  };
  private loadNotes(speed: number) {
    this.notes = this.bridge.samplePlayback(speed);
    if (
      this.notes.midi.some(
        (e) =>
          (e.opcode === 11 && e.data1 === 66 && e.data2 >= 64) ||
          (e.opcode === 14 && e.data2 !== 8192),
      )
    )
      throw Error(
        'Bản này cần hiệu ứng ngoài piano nhẹ. Chọn Tiếng MuseScore trên header để nghe đầy đủ.',
      );
    this.speedValue = speed;
    this.segmentStart = mapPlaybackTime(this.notes.timeMap, this.range.startMs, false);
    this.segmentEnd = mapPlaybackTime(this.notes.timeMap, this.range.endMs, false);
  }
  async start(speed: number, loop: boolean) {
    this.preparing = true;
    this.emit();
    this.loadNotes(speed);
    this.looping = loop;
    const runtime = await sampleRuntime();
    this.abort.signal.throwIfAborted();
    this.context = runtime.context;
    await this.piano.prepare(
      this.notes!.midi.map((e) => e.channel),
      this.abort.signal,
    );
    this.abort.signal.throwIfAborted();
    this.preparing = false;
    if (this.pausedBeforeReady) {
      this.status = 'paused';
      this.emit();
    } else await this.play();
    this.refresh();
  }
  private async play() {
    this.requestedPlayback = true;
    this.audible = false;
    this.startsAt = Infinity;
    const generation = ++this.generation;
    await resumeSound();
    if (this.disposed || generation !== this.generation || !this.context || !this.notes) return;
    if (this.position >= this.range.endMs) this.position = this.range.startMs;
    const { tone } = await sampleRuntime();
    if (this.disposed || generation !== this.generation) return;
    const transport = this.context.transport;
    transport.stop();
    transport.cancel(0);
    this.part?.dispose();
    this.piano.stopPreview();
    const from = mapPlaybackTime(this.notes.timeMap, this.position, false);
    const batches = auditionBatches(
      this.notes.midi,
      this.segmentStart,
      this.segmentEnd,
      from,
      this.looping,
    );
    const part = (this.part = new tone.Part<[number, MidiBatch]>({
      context: this.context,
      callback: (time, batch) => {
        if (this.disposed || generation !== this.generation) return;
        const chase = batch.chase ?? batch.initialChase;
        // Seek state is restored once. It must not reset keys again when an
        // A–B loop later passes the original seek position.
        batch.initialChase = undefined;
        if (chase) {
          this.piano.release(time);
          for (const event of chase) {
            // Upstream Piano's pedal uses time > downTime. Chased notes
            // already have a depressed pedal before this boundary.
            const pedal = event.opcode === 11 && event.data1 === 64 && event.data2 >= 64;
            this.piano.event(event, pedal ? time - 0.000001 : time);
          }
        }
        for (const event of batch.events) this.piano.event(event, time);
      },
      events: [],
    }));
    for (const [ms, batch] of [...batches].sort((a, b) => a[0] - b[0])) part.add(ms / 1000, batch);
    part.start(0);
    transport.loop = this.looping;
    transport.loopStart = this.segmentStart / 1000;
    transport.loopEnd = this.segmentEnd / 1000;
    this.startsAt = this.context.now() + 0.02;
    transport.start(this.startsAt, from / 1000);
    this.status = 'playing';
    this.emit();
  }
  async toggle() {
    if (this.requestedPlayback) this.pause();
    else await this.play();
  }
  pause() {
    if (this.disposed) return;
    this.generation++;
    this.requestedPlayback = false;
    this.audible = false;
    if (this.preparing) this.pausedBeforeReady = true;
    this.context?.transport.pause();
    this.piano.stopPreview();
    this.status = 'paused';
    this.emit();
  }
  seek(ms: number) {
    const playing = this.requestedPlayback;
    this.pause();
    this.position = Math.max(this.range.startMs, Math.min(this.range.endMs, ms));
    this.emit();
    if (playing) void this.play().catch(this.fail);
  }
  speed(value: number) {
    const playing = this.requestedPlayback;
    this.pause();
    try {
      this.loadNotes(value);
      this.emit();
      if (playing) void this.play().catch(this.fail);
    } catch (error) {
      this.stop();
      this.onError(error);
    }
  }
  loop(value: boolean) {
    const playing = this.requestedPlayback;
    this.pause();
    this.looping = value;
    if (playing) void this.play().catch(this.fail);
  }
  private fail = (error: unknown) => {
    if (this.disposed) return;
    this.stop();
    this.onError(error);
  };
  stop() {
    if (this.disposed) return;
    this.disposed = true;
    this.requestedPlayback = false;
    this.abort.abort();
    if (this.animation !== undefined) cancelAnimationFrame(this.animation);
    this.context?.transport.stop();
    this.part?.dispose();
    this.piano.dispose();
  }
}
