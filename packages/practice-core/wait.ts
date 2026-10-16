import type { Assessment, CoreState, Extra, InputEvent, LiveNote, Plan } from '../score-contracts/index';

export class WaitCore {
  readonly assessments: Assessment[] = []; readonly extras: Extra[] = []; readonly faults: string[] = [];
  private index = 0; private held = new Map<string, InputEvent>(); private accepted = new Map<number, InputEvent>();
  private seen = new Set<number>(); private readyAt = 0; private now = 0; private groupWrong = 0; private firstTry = 0; private corrections = 0;
  private feedback = new Map<number, LiveNote>();
  constructor(readonly plan: Plan) { this.readyAt = plan.groups[0]?.atMs ?? 0; }
  input(e: InputEvent): void {
    if (this.seen.has(e.seq) || !Number.isFinite(e.atMs) || !Number.isFinite(e.receivedMs)) return;
    this.seen.add(e.seq);
    if (this.seen.size > 200000) { this.faults.push('event-limit'); return; }
    this.now = Math.max(this.now, e.atMs);
    const key = `${e.deviceId}/${e.channel}/${e.pitch}`;
    if (e.type === 'off') {
      const on = this.held.get(key); this.held.delete(key);
      if (on) this.feedback.delete(on.seq);
      if (this.accepted.get(e.pitch)?.seq === on?.seq) {
        this.accepted.delete(e.pitch);
        const replacement = [...this.held.values()].find(held => held.pitch === e.pitch && this.feedback.get(held.seq)?.provisional);
        if (replacement) this.accepted.set(e.pitch, replacement);
      }
      return;
    }
    if (e.type !== 'on' || this.held.has(key)) return;
    this.held.set(key, e);
    this.feedback.set(e.seq, {seq: e.seq, pitch: e.pitch, held: true, state: 'ignored', provisional: false});
    if (e.receivedMs - e.atMs > this.plan.config.deliveryMs || e.atMs - e.receivedMs > 10) { this.faults.push('delivery-delay'); return; }
    const group = this.plan.groups[this.index];
    if (!group || e.atMs < 0) return;
    if (e.atMs < this.readyAt || !group.targets.some(t => t.pitch === e.pitch)) {
      ++this.groupWrong; ++this.corrections;
      this.feedback.set(e.seq, {seq: e.seq, pitch: e.pitch, held: true, state: 'extra', provisional: false});
      this.extras.push({seq: e.seq, pitch: e.pitch, atMs: e.atMs, reason: e.atMs < this.readyAt ? 'during-rest' : 'wrong-pitch', loop: group.targets[0].loop, measure: group.targets[0].measure}); return;
    }
    // Two channels playing the same physical pitch cannot replace a valid held attack.
    if (!this.accepted.has(e.pitch)) this.accepted.set(e.pitch, e);
    this.feedback.set(e.seq, {seq: e.seq, pitch: e.pitch, held: true, state: 'matched', provisional: true,
      targetId: group.targets.find(t => t.pitch === e.pitch)!.id});
    if (!group.targets.every(t => this.accepted.has(t.pitch))) return;
    for (const t of group.targets) {
      const accepted = this.accepted.get(t.pitch)!;
      this.assessments.push({targetId: t.id, status: 'matched', eventSeq: accepted.seq, atMs: t.atMs, performedAtMs: accepted.atMs});
      for (const value of this.feedback.values()) if (value.targetId === t.id) value.provisional = false;
    }
    if (!this.groupWrong) ++this.firstTry;
    ++this.index; this.accepted.clear(); this.groupWrong = 0;
    const next = this.plan.groups[this.index];
    this.readyAt = this.now + (next ? Math.max(0, next.atMs - group.endMs) : 0);
  }
  advance(now: number, assessmentsFrom = 0, extrasFrom = 0): CoreState { this.now = Math.max(this.now, now); return this.state(assessmentsFrom, extrasFrom); }
  clearHeld(): void { this.held.clear(); this.accepted.clear(); this.feedback.clear(); }
  state(assessmentsFrom = 0, extrasFrom = 0): CoreState {
    const g = this.plan.groups[this.index];
    return {assessments: this.assessments.slice(assessmentsFrom), extras: this.extras.slice(extrasFrom), cursor: g?.atMs ?? this.plan.durationMs,
      done: !g && !this.faults.length, faults: [...new Set(this.faults)], firstTry: this.firstTry, groupsDone: this.index,
      corrections: this.corrections, held: [...this.held.values()].map(e => e.pitch), missing: g?.targets.filter(t => !this.accepted.has(t.pitch)).map(t => t.pitch) ?? [],
      live: [...this.feedback.values()].map(f => ({...f})), restMs: g ? Math.max(0, this.readyAt - this.now) : 0};
  }
}
