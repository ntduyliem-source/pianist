import type { Attack, Assessment, CoreState, Extra, InputEvent, LiveNote, Plan } from '../score-contracts/index';
import {ReleaseTracker} from './release';

interface Block {targets: Attack[]; lower: number; upper: number; closed: boolean; inputs: InputEvent[]}
// Ordered one-to-one alignment. Maximize coverage first, then minimize absolute error.
export function align(targets: Attack[], events: InputEvent[], offset: number, window: number): [number, number][] {
  const n = targets.length, m = events.length, width = m + 1;
  const score = new Float64Array((n + 1) * width), path = new Uint8Array(score.length);
  for (let i = 1; i <= n; ++i) for (let j = 1; j <= m; ++j) {
    const k = i * width + j;
    score[k] = score[(i - 1) * width + j]; path[k] = 1;
    if (score[k - 1] > score[k]) { score[k] = score[k - 1]; path[k] = 2; }
    const delta = Math.abs(events[j - 1].atMs - offset - targets[i - 1].atMs);
    if (delta <= window) {
      const candidate = score[(i - 1) * width + j - 1] + 1_000_000 - delta;
      if (candidate > score[k]) { score[k] = candidate; path[k] = 3; }
    }
  }
  let i = n, j = m; const pairs: [number, number][] = [];
  while (i > 0 && j > 0) {
    const p = path[i * width + j];
    if (p === 3) { pairs.push([--i, --j]); } else if (p === 1) --i; else --j;
  }
  return pairs.reverse();
}

export class BpmCore {
  readonly assessments: Assessment[] = []; readonly extras: Extra[] = []; readonly faults: string[] = [];
  private blocks = new Map<number, Block[]>(); private seen = new Set<number>();
  private held = new Map<string, InputEvent>(); private now = -Infinity; private totalEvents = 0;
  private feedback = new Map<number, LiveNote>();
  private deadlines: Block[] = []; private deadlineIndex = 0;
  readonly releases: ReleaseTracker;
  constructor(readonly plan: Plan) {
    this.releases = new ReleaseTracker(plan);
    const pitches = new Map<number, Attack[]>();
    for (const t of plan.targets) { const list = pitches.get(t.pitch) ?? []; list.push(t); pitches.set(t.pitch, list); }
    for (const [pitch, list] of pitches) {
      const blocks: Block[] = [];
      for (const t of list) {
        const last = blocks.at(-1);
        if (!last || last.targets.length >= 8 || t.atMs - last.targets[0].atMs > 1500 || t.atMs - last.targets.at(-1)!.atMs > 2 * plan.config.windowMs) {
          blocks.push({targets: [t], lower: -Infinity, upper: Infinity, closed: false, inputs: []});
        } else last.targets.push(t);
      }
      for (let i = 1; i < blocks.length; ++i) {
        const boundary = (blocks[i - 1].targets.at(-1)!.atMs + blocks[i].targets[0].atMs) / 2;
        blocks[i - 1].upper = boundary; blocks[i].lower = boundary;
      }
      this.blocks.set(pitch, blocks);
      this.deadlines.push(...blocks);
    }
    this.deadlines.sort((a, b) => a.targets.at(-1)!.atMs - b.targets.at(-1)!.atMs);
  }
  input(e: InputEvent): void {
    if (this.seen.has(e.seq) || !Number.isFinite(e.atMs) || !Number.isFinite(e.receivedMs)) return;
    if (++this.totalEvents > 200000) { this.faults.push('event-limit'); return; }
    this.seen.add(e.seq);
    const key = `${e.deviceId}/${e.channel}/${e.pitch}`;
    if (this.releases.enabled && (e.receivedMs - e.atMs > this.plan.config.deliveryMs || e.atMs - e.receivedMs > 10)) {this.faults.push('delivery-delay'); return;}
    if (e.type !== 'on' || !this.held.has(key)) this.releases.input(e);
    if (e.type === 'off') {
      const on = this.held.get(key); this.held.delete(key);
      if (on) {const value = this.feedback.get(on.seq); if (value?.provisional) value.held = false; else this.feedback.delete(on.seq);}
      return;
    }
    if (e.type !== 'on') return;
    if (this.held.has(key)) return; // duplicate Note On while held is not a fresh physical attack
    this.held.set(key, e);
    this.feedback.set(e.seq, {seq: e.seq, pitch: e.pitch, held: true, state: 'ignored', provisional: false});
    if (e.receivedMs - e.atMs > this.plan.config.deliveryMs || e.atMs - e.receivedMs > 10) { this.faults.push('delivery-delay'); return; }
    const at = e.atMs - this.plan.config.offsetMs;
    if (at < -this.plan.config.windowMs || at > this.plan.durationMs + this.plan.config.windowMs) return;
    const blocks = this.blocks.get(e.pitch);
    let block: Block | undefined;
    if (blocks?.length) {
      let lo = 0, hi = blocks.length - 1;
      while (lo < hi) {const mid = (lo + hi) >> 1; if (at < blocks[mid].upper) hi = mid; else lo = mid + 1;}
      block = blocks[lo];
    }
    // An input outside every candidate window is an extra, even if that pitch
    // appeared earlier. It is not evidence of a delayed MIDI delivery.
    if (!block) { this.extra(e, 'no-pitch-target'); return; }
    if (at < block.targets[0].atMs - this.plan.config.windowMs || at > block.targets.at(-1)!.atMs + this.plan.config.windowMs) {
      this.extra(e, 'outside-pitch-window'); return;
    }
    if (block.closed) { this.faults.push('late-after-finalization'); return; }
    if (block.inputs.length >= 256) { this.faults.push('queue-overflow'); return; }
    block.inputs.push(e);
    this.preview(block);
  }
  advance(now: number, assessmentsFrom = 0, extrasFrom = 0, releasesFrom = 0): CoreState {
    this.now = Math.max(this.now, now);
    if (!this.faults.length) {
      while (this.deadlineIndex < this.deadlines.length) {
        const b = this.deadlines[this.deadlineIndex];
        if (b.targets.at(-1)!.atMs + this.finalizationLag >= this.now) break;
        ++this.deadlineIndex; this.close(b);
      }
      this.releases.advance(this.now);
    }
    return this.state(assessmentsFrom, extrasFrom, releasesFrom);
  }
  private close(b: Block): void {
    b.closed = true;
    b.inputs.sort((a, c) => a.atMs - c.atMs || a.seq - c.seq);
    const pairs = align(b.targets, b.inputs, this.plan.config.offsetMs, this.plan.config.windowMs);
    const matched = new Map(pairs), used = new Set(pairs.map(p => p[1]));
    b.targets.forEach((t, i) => {
      const j = matched.get(i);
      if (j === undefined) this.assessments.push({targetId: t.id, status: 'missed', atMs: t.atMs});
      else {
        const e = b.inputs[j], deltaMs = e.atMs - this.plan.config.offsetMs - t.atMs;
        const grade = this.grade(deltaMs);
        this.assessments.push({targetId: t.id, status: 'matched', eventSeq: e.seq, deltaMs, atMs: t.atMs, performedAtMs: e.atMs, grade});
        this.releases.match(t, e);
        const held = this.feedback.get(e.seq)?.held ?? false;
        if (held) this.feedback.set(e.seq, {seq: e.seq, pitch: e.pitch, targetId: t.id, state: 'matched', provisional: false, held, deltaMs, grade});
        else this.feedback.delete(e.seq);
      }
    });
    b.inputs.forEach((e, j) => { if (!used.has(j)) this.extra(e, 'unmatched-onset'); }); b.inputs = [];
  }
  private grade(delta: number): Assessment['grade'] {return Math.abs(delta) <= this.plan.config.perfectMs ? 'perfect' : Math.abs(delta) <= this.plan.config.goodMs ? 'good' : 'outside';}
  private preview(b: Block): void {
    b.inputs.sort((a, c) => a.atMs - c.atMs || a.seq - c.seq);
    const matches = new Map(align(b.targets, b.inputs, this.plan.config.offsetMs, this.plan.config.windowMs).map(([i, j]) => [j, b.targets[i]]));
    b.inputs.forEach((e, j) => {
      const t = matches.get(j), deltaMs = t ? e.atMs - this.plan.config.offsetMs - t.atMs : undefined;
      this.feedback.set(e.seq, {seq: e.seq, pitch: e.pitch, held: this.feedback.get(e.seq)?.held ?? false, targetId: t?.id,
        state: t ? 'matched' : 'extra', provisional: true, deltaMs, grade: deltaMs === undefined ? undefined : this.grade(deltaMs)});
    });
  }
  private extra(e: InputEvent, reason: string): void {
    this.releases.discard(e.seq);
    const at = e.atMs - this.plan.config.offsetMs, visits = this.plan.visits ?? [];
    let low = 0, high = visits.length;
    while (low < high) {const middle = (low + high) >>> 1; if (visits[middle].startMs <= at) low = middle + 1; else high = middle;}
    const visit = visits[Math.max(0, low - 1)];
    this.extras.push({seq: e.seq, pitch: e.pitch, atMs: e.atMs, reason, ...(visit ? {loop: visit.loop, measure: visit.measure} : {})});
    const held = this.feedback.get(e.seq)?.held ?? false;
    if (held) this.feedback.set(e.seq, {seq: e.seq, pitch: e.pitch, held, state: 'extra', provisional: false}); else this.feedback.delete(e.seq);
  }
  // Input timestamps are offset-corrected for matching; deadlines still live
  // on the uncorrected transport clock. Keep the inclusive boundary open.
  private get finalizationLag(): number {return this.plan.config.windowMs + this.plan.config.deliveryMs + Math.max(0, this.plan.config.offsetMs);}
  clearHeld(): void {
    this.releases.clearHeld();
    this.held.clear();
    for (const [seq, f] of this.feedback) {if (f.provisional) f.held = false; else this.feedback.delete(seq);}
  }
  state(assessmentsFrom = 0, extrasFrom = 0, releasesFrom = 0): CoreState {
    return {assessments: this.assessments.slice(assessmentsFrom).sort((a, b) => a.atMs - b.atMs || a.targetId.localeCompare(b.targetId)),
      extras: this.extras.slice(extrasFrom).sort((a, b) => a.seq - b.seq), cursor: Math.max(0, this.now),
      done: !this.faults.length && this.now > this.plan.durationMs + this.finalizationLag && this.assessments.length === this.plan.targets.length && this.releases.done,
      faults: [...new Set(this.faults)], firstTry: 0, groupsDone: 0, corrections: 0, held: [...this.held.values()].map(e => e.pitch), missing: [],
      live: [...this.feedback.values()].sort((a, b) => a.seq - b.seq).map(f => ({...f})),
      ...(this.releases.enabled ? {releases: this.releases.assessments.slice(releasesFrom)} : {})};
  }
}
