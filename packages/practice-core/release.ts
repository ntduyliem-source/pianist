import type {Attack, InputEvent, Plan, ReleaseAssessment} from '../score-contracts/index';

interface Press {seq: number; atMs: number; key: string; channel: string; offMs?: number; soundEndMs?: number; interrupted?: boolean}
// Optional, separate from onset scoring. This measures MIDI key/sustain events,
// never claims to measure the acoustic decay of a physical piano.
export class ReleaseTracker {
  readonly assessments: ReleaseAssessment[] = [];
  private presses = new Map<number, Press>();
  private keys = new Map<string, Press>(); private sustained = new Map<string, Press>(); private pedals = new Set<string>();
  private pending = new Map<string, {target: Attack; press: Press; expectedMs: number}>();
  readonly enabled: boolean;
  constructor(readonly plan: Plan) {this.enabled = plan.config.mode === 'bpm' && !!plan.config.releaseMode && plan.config.releaseMode !== 'off';}
  input(e: InputEvent): void {
    if (!this.enabled) return;
    const channel = `${e.deviceId}/${e.channel}`, key = `${channel}/${e.pitch}`;
    if (e.synthetic) {
      for (const map of [this.keys, this.sustained]) for (const [id, press] of map) {
        if (e.type === 'off' ? id === key : press.channel === channel) {press.interrupted = true; map.delete(id);}
      }
      if (e.type === 'pedal') this.pedals.delete(channel);
      this.advance(e.receivedMs); return;
    }
    if (e.type === 'on') {
      const previous = this.sustained.get(key);
      if (previous) {previous.soundEndMs = e.atMs; this.sustained.delete(key);}
      const press = {seq: e.seq, atMs: e.atMs, key, channel}; this.presses.set(e.seq, press); this.keys.set(key, press);
    } else if (e.type === 'off') {
      const press = this.keys.get(key);
      if (press) {
        press.offMs = e.atMs; this.keys.delete(key);
        if (this.pedals.has(channel)) this.sustained.set(key, press); else press.soundEndMs = e.atMs;
      }
    } else if (e.pitch === 64) {
      if (e.velocity >= 64) this.pedals.add(channel);
      else {
        this.pedals.delete(channel);
        for (const [key, press] of this.sustained) if (press.channel === channel) {press.soundEndMs = e.atMs; this.sustained.delete(key);}
      }
    }
    this.advance(e.receivedMs);
  }
  match(target: Attack, event: InputEvent): void {
    if (!this.enabled) return;
    const press = this.presses.get(event.seq);
    if (!press) return;
    const ratio = this.plan.config.releaseMode === 'key' ? target.releaseRatio ?? 1 : 1;
    this.pending.set(target.id, {target, press, expectedMs: (target.endMs - target.atMs) * ratio});
  }
  advance(now: number): void {
    for (const [id, {target, press, expectedMs}] of this.pending) {
      const end = this.plan.config.releaseMode === 'key' ? press.offMs : press.soundEndMs;
      const tolerance = Math.max(80, Math.min(200, expectedMs * .2));
      const base = {targetId: id, eventSeq: press.seq, expectedMs};
      let result: ReleaseAssessment | undefined;
      if (target.releaseUnsupported) result = {...base, status: 'unscored'};
      else if (end !== undefined) {
        const heldMs = Math.max(0, end - press.atMs), deltaMs = heldMs - expectedMs;
        result = {...base, heldMs, deltaMs, status: deltaMs < -tolerance - .000001 ? 'short' : deltaMs > tolerance + .000001 ? 'long' : 'good'};
      } else if (press.interrupted) result = {...base, status: 'interrupted'};
      else if (now > press.atMs + expectedMs + tolerance + this.plan.config.deliveryMs) result = {...base, status: 'unreleased'};
      if (result) {this.assessments.push(result); this.pending.delete(id); this.presses.delete(press.seq);}
    }
  }
  discard(seq: number): void {this.presses.delete(seq);}
  clearHeld(): void {
    for (const press of [...this.keys.values(), ...this.sustained.values()]) press.interrupted = true;
    this.keys.clear(); this.sustained.clear(); this.pedals.clear();
    this.advance(-Infinity);
  }
  get done(): boolean {return this.pending.size === 0;}
}
