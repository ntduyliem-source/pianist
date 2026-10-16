import type { Attack, Assessment, CoreState, Extra, InputEvent, Plan } from '../score-contracts/index';

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
  private held = new Set<string>(); private now = -Infinity; private totalEvents = 0;
  constructor(readonly plan: Plan) {
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
    }
  }
  input(e: InputEvent): void {
    if (this.seen.has(e.seq) || !Number.isFinite(e.atMs) || !Number.isFinite(e.receivedMs)) return;
    if (++this.totalEvents > 200000) { this.faults.push('event-limit'); return; }
    this.seen.add(e.seq);
    const key = `${e.deviceId}/${e.channel}/${e.pitch}`;
    if (e.type === 'off') { this.held.delete(key); return; }
    if (e.type !== 'on') return;
    if (this.held.has(key)) return; // duplicate Note On while held is not a fresh physical attack
    this.held.add(key);
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
  }
  advance(now: number): CoreState {
    this.now = Math.max(this.now, now);
    if (!this.faults.length) {
      for (const blocks of this.blocks.values()) for (const b of blocks) {
        if (b.closed || b.targets.at(-1)!.atMs + this.finalizationLag >= this.now) continue;
        this.close(b);
      }
    }
    return this.state();
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
        this.assessments.push({targetId: t.id, status: 'matched', eventSeq: e.seq, deltaMs, atMs: t.atMs,
          grade: Math.abs(deltaMs) <= this.plan.config.perfectMs ? 'perfect' : Math.abs(deltaMs) <= this.plan.config.goodMs ? 'good' : 'outside'});
      }
    });
    b.inputs.forEach((e, j) => { if (!used.has(j)) this.extra(e, 'unmatched-onset'); }); b.inputs = [];
  }
  private extra(e: InputEvent, reason: string): void { this.extras.push({seq: e.seq, pitch: e.pitch, atMs: e.atMs, reason}); }
  // Input timestamps are offset-corrected for matching; deadlines still live
  // on the uncorrected transport clock. Keep the inclusive boundary open.
  private get finalizationLag(): number {return this.plan.config.windowMs + this.plan.config.deliveryMs + Math.max(0, this.plan.config.offsetMs);}
  clearHeld(): void { this.held.clear(); }
  state(): CoreState {
    return {assessments: [...this.assessments].sort((a, b) => a.atMs - b.atMs || a.targetId.localeCompare(b.targetId)),
      extras: [...this.extras].sort((a, b) => a.seq - b.seq), cursor: Math.max(0, this.now),
      done: !this.faults.length && this.now > this.plan.durationMs + this.finalizationLag && this.assessments.length === this.plan.targets.length,
      faults: [...new Set(this.faults)], firstTry: 0, groupsDone: 0, corrections: 0, held: [...this.held].map(k => Number(k.split('/').at(-1))), missing: []};
  }
}
