import type { Attack, Plan } from '../../../../packages/score-contracts/index';

export class PracticeTransport {
  context?: AudioContext; source = 'performance fallback'; private originContext = 0; private playing = false;
  private beatIndex = 0; private clicks: {atMs: number; accent: boolean}[] = []; private scheduled = new Set<OscillatorNode>();
  private voices = new Map<number, {osc: OscillatorNode; gain: GainNode}>();
  private guide: Attack[] = []; private guideIndex = 0;
  private operation = 0;
  onSuspend: () => void = () => {};
  async audio(): Promise<AudioContext> {
    if (!this.context) {
      this.context = new AudioContext({latencyHint: 'interactive'});
      this.context.onstatechange = () => {if (this.playing && this.context?.state !== 'running') this.onSuspend();};
    }
    await this.context.resume(); return this.context;
  }
  private pair(): {contextTime: number; performanceTime: number} {
    const ctx = this.context!;
    const pair = ctx.getOutputTimestamp?.();
    if (pair && typeof pair.contextTime === 'number' && typeof pair.performanceTime === 'number' && pair.contextTime > 0 && pair.performanceTime > 0 && Math.abs(performance.now() - pair.performanceTime) < 1000) {
      this.source = 'AudioContext.getOutputTimestamp'; return {contextTime: pair.contextTime, performanceTime: pair.performanceTime};
    }
    this.source = 'AudioContext.currentTime + outputLatency fallback';
    return {contextTime: ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0), performanceTime: performance.now()};
  }
  relative(perfMs: number): number {
    const p = this.pair(); return (p.contextTime - this.originContext) * 1000 + perfMs - p.performanceTime;
  }
  position(): number {return this.context ? this.relative(performance.now()) : 0;}
  async start(plan: Plan, position = 0): Promise<void> {
    this.stop(); const operation = this.operation, ctx = await this.audio();
    if (operation !== this.operation) return;
    const beatMs = 60000 / plan.config.bpm, countMs = plan.config.countIn * beatMs;
    this.originContext = ctx.currentTime + .15 + (countMs - position) / 1000;
    this.clicks = [];
    for (let i = 0; i < plan.config.countIn; ++i) this.clicks.push({atMs: position - countMs + i * beatMs, accent: i === 0});
    if (plan.config.metronome && plan.config.mode === 'bpm') this.clicks.push(...plan.beats.filter(b => b.atMs >= position));
    this.guide = plan.config.mode === 'bpm' ? (plan.accompaniment ?? []).filter(t => t.endMs > position).map(t => t.atMs < position ? {...t, atMs: position} : t) : [];
    this.beatIndex = 0; this.guideIndex = 0; this.playing = true; this.schedule();
  }
  schedule(): void {
    if (!this.playing || !this.context) return;
    const ctx = this.context;
    while (this.beatIndex < this.clicks.length && this.originContext + this.clicks[this.beatIndex].atMs / 1000 <= ctx.currentTime + .18) {
      const b = this.clicks[this.beatIndex++], time = this.originContext + b.atMs / 1000;
      if (time < ctx.currentTime - .04) continue;
      const osc = ctx.createOscillator(), gain = ctx.createGain(); osc.frequency.value = b.accent ? 1500 : 1000;
      gain.gain.setValueAtTime(.12, Math.max(time, ctx.currentTime)); gain.gain.exponentialRampToValueAtTime(.001, Math.max(time, ctx.currentTime) + .045);
      osc.connect(gain).connect(ctx.destination); osc.start(Math.max(time, ctx.currentTime)); osc.stop(Math.max(time, ctx.currentTime) + .05);
      this.scheduled.add(osc); osc.onended = () => {this.scheduled.delete(osc); gain.disconnect();};
    }
    while (this.guideIndex < this.guide.length && this.originContext + this.guide[this.guideIndex].atMs / 1000 <= ctx.currentTime + .18) {
      const note = this.guide[this.guideIndex++], at = this.originContext + note.atMs / 1000;
      if (at < ctx.currentTime - .04 || this.scheduled.size >= 64) continue;
      const osc = ctx.createOscillator(), gain = ctx.createGain(), start = Math.max(at, ctx.currentTime);
      const duration = Math.max(.04, (note.endMs - note.atMs) / 1000), end = start + duration;
      osc.type = 'triangle'; osc.frequency.value = 440 * 2 ** ((note.pitch - 69) / 12);
      gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(.035, start + .008);
      gain.gain.exponentialRampToValueAtTime(.012, start + Math.min(.25, duration / 2));
      gain.gain.setTargetAtTime(.0001, end, .035); osc.connect(gain).connect(ctx.destination);
      osc.start(start); osc.stop(end + .18); this.scheduled.add(osc);
      osc.onended = () => {this.scheduled.delete(osc); gain.disconnect();};
    }
  }
  tone(pitch: number, on: boolean): void {
    const ctx = this.context; if (!ctx || ctx.state !== 'running') return;
    const old = this.voices.get(pitch);
    if (old) {old.gain.gain.cancelScheduledValues(ctx.currentTime); old.gain.gain.setTargetAtTime(.0001, ctx.currentTime, .04); old.osc.stop(ctx.currentTime + .2); this.voices.delete(pitch);}
    if (!on || this.voices.size >= 32) return;
    const osc = ctx.createOscillator(), gain = ctx.createGain(); osc.type = 'triangle'; osc.frequency.value = 440 * 2 ** ((pitch - 69) / 12);
    gain.gain.setValueAtTime(.0001, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.08, ctx.currentTime + .008); gain.gain.exponentialRampToValueAtTime(.015, ctx.currentTime + 1);
    osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 8);
    osc.onended = () => {gain.disconnect(); if (this.voices.get(pitch)?.osc === osc) this.voices.delete(pitch);};
    this.voices.set(pitch, {osc, gain});
  }
  stop(): void {
    ++this.operation;
    this.playing = false;
    this.guide = []; this.guideIndex = 0;
    for (const osc of this.scheduled) {try {osc.stop();} catch {}} this.scheduled.clear();
    // AudioContext can already be suspended when the interruption callback runs.
    // Stop voices directly; tone() deliberately refuses new work in that state.
    for (const {osc, gain} of this.voices.values()) {try {osc.stop();} catch {} gain.disconnect();}
    this.voices.clear();
  }
}
