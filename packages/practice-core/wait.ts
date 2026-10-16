import type { Assessment, CoreState, Extra, InputEvent, Plan } from '../score-contracts/index';

export class WaitCore {
  readonly assessments: Assessment[] = []; readonly extras: Extra[] = []; readonly faults: string[] = [];
  private index = 0; private held = new Map<string, InputEvent>(); private accepted = new Map<number, InputEvent>();
  private seen = new Set<number>(); private readyAt = 0; private now = 0; private groupWrong = 0; private firstTry = 0; private corrections = 0;
  constructor(readonly plan: Plan) { this.readyAt = plan.groups[0]?.atMs ?? 0; }
  input(e: InputEvent): void {
    if (this.seen.has(e.seq) || !Number.isFinite(e.atMs)) return;
    this.seen.add(e.seq);
    if (this.seen.size > 200000) { this.faults.push('event-limit'); return; }
    this.now = Math.max(this.now, e.atMs);
    const key = `${e.deviceId}/${e.channel}/${e.pitch}`;
    if (e.type === 'off') {
      const on = this.held.get(key); this.held.delete(key);
      if (this.accepted.get(e.pitch)?.seq === on?.seq) this.accepted.delete(e.pitch);
      return;
    }
    if (e.type !== 'on' || this.held.has(key)) return;
    this.held.set(key, e);
    if (e.receivedMs - e.atMs > this.plan.config.deliveryMs) { this.faults.push('delivery-delay'); return; }
    const group = this.plan.groups[this.index];
    if (!group || e.atMs < 0) return;
    if (e.atMs < this.readyAt || !group.targets.some(t => t.pitch === e.pitch)) {
      ++this.groupWrong; ++this.corrections;
      this.extras.push({seq: e.seq, pitch: e.pitch, atMs: e.atMs, reason: e.atMs < this.readyAt ? 'during-rest' : 'wrong-pitch'}); return;
    }
    this.accepted.set(e.pitch, e);
    if (!group.targets.every(t => this.accepted.has(t.pitch))) return;
    for (const t of group.targets) this.assessments.push({targetId: t.id, status: 'matched', eventSeq: this.accepted.get(t.pitch)!.seq, atMs: t.atMs});
    if (!this.groupWrong) ++this.firstTry;
    ++this.index; this.accepted.clear(); this.groupWrong = 0;
    const next = this.plan.groups[this.index];
    this.readyAt = this.now + (next ? Math.max(0, next.atMs - group.endMs) : 0);
  }
  advance(now: number): CoreState { this.now = Math.max(this.now, now); return this.state(); }
  clearHeld(): void { this.held.clear(); this.accepted.clear(); }
  state(): CoreState {
    const g = this.plan.groups[this.index];
    return {assessments: [...this.assessments], extras: [...this.extras], cursor: g?.atMs ?? this.plan.durationMs,
      done: !g && !this.faults.length, faults: [...new Set(this.faults)], firstTry: this.firstTry, groupsDone: this.index,
      corrections: this.corrections, held: [...this.held.values()].map(e => e.pitch), missing: g?.targets.filter(t => !this.accepted.has(t.pitch)).map(t => t.pitch) ?? []};
  }
}
