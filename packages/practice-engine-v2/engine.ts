// Event-time host around source-derived kernels. Timestamp conversion, delivery
// buffering, MIDI state and deterministic clock stepping are adapters, not matchers.
import {ENGINE_ID, type EngineView, type MidiEvent, type ReplayCommand, type Timeline, type Unconsumed} from './model';
import {ManiaKernel, type Judgement} from './upstream/mania';
import {createStudioWait} from './upstream/studio-wait.js';
import {MidiState} from './midi-state';
import {releaseDeadline,releaseJudgement} from './release-assessment';

function nextFloat(value: number): number {
  const bytes = new DataView(new ArrayBuffer(8));
  bytes.setFloat64(0, value);
  bytes.setBigUint64(0, bytes.getBigUint64(0) + (value >= 0 ? 1n : -1n));
  return bytes.getFloat64(0);
}

export class PracticeEngine {
  readonly midi = new MidiState();
  readonly bpm: ManiaKernel;
  readonly wait = createStudioWait();
  readonly judgements: Judgement[] = [];
  readonly extras: Unconsumed[] = [];
  readonly faults: string[] = [];
  private readonly targets;
  private queue: MidiEvent[] = [];
  private seen = new Set<number>();
  private deadlineIndex = 0;
  private judgeRead = 0;
  private groupIndex = 0;
  private processed = -Number.MAX_VALUE;
  private attackFrom: number;
  private complete = false;
  private readonly finishAfter:number;
  private lastRelease:EngineView['releaseFeedback'];
  constructor(readonly timeline: Timeline) {
    if (timeline.version !== 2 || timeline.engine !== ENGINE_ID || !timeline.targets.length) throw Error('Bản tập không tương thích với engine mới.');
    this.targets = new Map(timeline.targets.map(t => [t.id, t]));
    this.bpm = new ManiaKernel(timeline.targets.map(t => ({id: t.id, pitch: t.pitch, at: t.atMs})), timeline.settings.difficulty);
    this.finishAfter=Math.max(timeline.durationMs+this.bpm.windows.values.miss,releaseDeadline(timeline));
    this.attackFrom = timeline.settings.mode==='wait'?0:-this.bpm.windows.values.miss;
    this.loadWaitGroup();
  }
  private loadWaitGroup(): void {
    this.wait.setTargets((this.timeline.groups[this.groupIndex]?.ids ?? []).map(id => ({id, midi: this.targets.get(id)!.pitch, staffId: 0})));
  }
  private collectBpm(): void {
    while (this.judgeRead < this.bpm.judgements.length) this.judgements.push(this.bpm.judgements[this.judgeRead++]);
  }
  private runClock(until: number): void {
    if (this.timeline.settings.mode !== 'bpm') {this.processed = Math.max(this.processed, until); return;}
    // Deterministic frame host: call upstream just past each expiry boundary.
    // This prevents miss timestamps from depending on browser rendering/tick rate.
    const notes = this.bpm.notes, width = this.bpm.windows.values.meh;
    while (this.deadlineIndex < notes.length) {
      const expiry = nextFloat(notes[this.deadlineIndex].at + width);
      if (expiry > until) break;
      this.bpm.advance(expiry); this.deadlineIndex++;
    }
    this.collectBpm(); this.processed = Math.max(this.processed, until);
  }
  input(event: MidiEvent): void {
    if (this.complete || this.faults.length || this.seen.has(event.sequence)) return;
    const c = this.timeline.settings;
    if (event.source !== c.inputSource || event.portId !== c.deviceId) return;
    const delay = event.receivedMs - event.timestampMs;
    if (!Number.isFinite(event.timestampMs) || !Number.isFinite(event.receivedMs) || delay < -10 || (!event.synthetic && !event.stateOnly && delay > c.maxDeliveryMs)) {
      this.faults.push('input-delivery-outside-bound'); return;
    }
    if (!Number.isInteger(event.pitch) || event.pitch < 0 || event.pitch > 127 || !Number.isInteger(event.channel) || event.channel < 0 || event.channel > 15
        || !Number.isInteger(event.sequence) || !Number.isFinite(event.value) || event.value < 0 || event.value > 127) {
      this.faults.push('invalid-midi-event'); return;
    }
    if (this.seen.size >= 250000) {this.faults.push('event-capacity'); return;}
    this.seen.add(event.sequence);
    const corrected = event.timestampMs - (c.mode === 'bpm' ? c.offsetMs : 0);
    if (corrected < this.processed && !event.stateOnly) {this.faults.push('input-after-watermark'); return;}
    this.queue.push({...event, timestampMs: event.stateOnly ? Math.max(this.processed, corrected) : corrected});
    if (this.queue.length > 8192) this.faults.push('input-buffer-capacity');
  }
  private consume(e: MidiEvent): void {
    this.runClock(e.timestampMs);
    const fresh = this.midi.input(e);
    const c = this.timeline.settings;
    if(c.mode==='bpm'&&c.durationEnabled!==false&&e.kind==='off'){
      const n=this.midi.intervals.findLast(n=>n.portId===e.portId&&n.channel===e.channel&&n.pitch===e.pitch);
      const j=n?this.judgements.findLast(j=>j.seq===n.sequence):undefined;
      if(j)this.lastRelease=releaseJudgement(this.targets.get(j.id)!,j,n,this.processed);
    }
    if (c.mode === 'wait' && e.kind === 'off') this.wait.input(e.pitch, false);
    if (this.complete || !fresh || e.kind !== 'on' || e.synthetic || e.stateOnly || e.timestampMs < this.attackFrom) return;
    if (c.mode === 'bpm') {
      if (e.timestampMs > this.timeline.durationMs + this.bpm.windows.values.miss) return;
      const result = this.bpm.press(e.timestampMs, e.pitch, e.sequence);
      if (!result) this.extras.push({sequence: e.sequence, pitch: e.pitch, atMs: e.timestampMs});
      this.collectBpm();
    } else {
      const response = this.wait.input(e.pitch, true);
      for (const id of response.ids) this.judgements.push({id, grade: 'perfect', at: e.timestampMs, delta: 0, seq: e.sequence});
      if (response.wrong) this.extras.push({sequence: e.sequence, pitch: e.pitch, atMs: e.timestampMs});
      if (response.advanced) {this.groupIndex++; this.loadWaitGroup();}
      this.complete = this.groupIndex >= this.timeline.groups.length;
    }
  }
  private drain(until: number, inclusive: boolean): void {
    this.queue.sort((a, b) => a.timestampMs - b.timestampMs || a.sequence - b.sequence);
    let count = 0;
    while (count < this.queue.length && (inclusive ? this.queue[count].timestampMs <= until : this.queue[count].timestampMs < until)) {
      this.consume(this.queue[count++]);
    }
    this.queue.splice(0, count); this.runClock(until);
  }
  clock(now: number): void {
    if (this.complete || this.faults.length || !Number.isFinite(now)) return;
    const c = this.timeline.settings;
    const watermark = now - c.maxDeliveryMs - (c.mode === 'bpm' ? c.offsetMs : 0);
    if (watermark < this.processed) return;
    this.drain(watermark, false);
    if (c.mode === 'bpm' && watermark > this.finishAfter) this.complete = true;
  }
  boundary(atMs: number, kind: 'pause' | 'resume' | 'stop'): void {
    const at = atMs - (this.timeline.settings.mode === 'bpm' ? this.timeline.settings.offsetMs : 0);
    if (kind !== 'resume') this.drain(Math.max(this.processed, at), true);
    this.queue = [];
    this.midi.reset(Math.max(this.processed, at),kind==='stop'?'stop':'pause'); this.wait.resetKeys();
    this.attackFrom = kind === 'resume' ? Math.max(0, at) : this.attackFrom;
    // A pause never counts future targets as misses, and state-only resume
    // messages can restore physical pedal/key state without earning a new hit.
  }
  command(command: ReplayCommand): void {
    if (command.type === 'input') this.input(command.event);
    else if (command.type === 'clock') this.clock(command.atMs);
    else this.boundary(command.atMs, command.kind);
  }
  view(): EngineView {
    return {judgements: this.judgements, extras: this.extras, intervals: this.midi.intervals,
      held: this.midi.held, pedal: this.midi.pedal, group: this.groupIndex, done: this.complete,
      processedMs: this.processed, faults: this.faults,pedalIntervals:this.midi.pedalIntervals,controls:this.midi.controls,releaseFeedback:this.lastRelease};
  }
}
