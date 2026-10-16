import type {Attack, CoreState, Plan} from '../../../../packages/score-contracts/index';

export interface Marker {kind: 'current' | 'hit' | 'pending' | 'timing' | 'miss'; label: string; symbol: string; provisional?: boolean}
const timingLabel = (delta?: number) => delta === undefined ? '' : ` · ${delta < 0 ? 'sớm' : 'trễ'} ${Math.round(Math.abs(delta))} ms`;
function floorIndex<T>(items: T[], position: number, at: (item: T) => number): number {
  let low = 0, high = items.length;
  while (low < high) {const middle = (low + high) >>> 1; if (at(items[middle]) <= position + .001) low = middle + 1; else high = middle;}
  return Math.max(0, low - 1);
}

// A written note can appear in several performed passes. Keep outcomes attached
// to that visit, never paint a future repeat using the preceding repeat's grade.
export class FeedbackIndex {
  private passes = new Map<number, {target: Attack; anchors: string[]}[]>();
  constructor(readonly plan: Plan) {
    const passByVisit = new Map(plan.visits?.map(v => [`${v.loop}/${v.occurrence}`, v.pass]));
    for (const target of plan.targets) {
      const anchorsByPass = new Map<number, string[]>();
      for (const span of target.spans ?? target.anchors.map(anchor => ({anchor, occurrence: target.occurrence}))) {
        const pass = passByVisit.get(`${target.loop}/${span.occurrence}`) ?? target.loop;
        const anchors = anchorsByPass.get(pass) ?? []; anchors.push(span.anchor); anchorsByPass.set(pass, anchors);
      }
      for (const [pass, anchors] of anchorsByPass) {const list = this.passes.get(pass) ?? []; list.push({target, anchors}); this.passes.set(pass, list);}
    }
  }
  frame(position: number, core?: CoreState) {
    const {plan} = this;
    const group = plan.config.mode === 'wait' ? plan.groups[core?.groupsDone ?? 0] : plan.groups[floorIndex(plan.groups, position, g => g.atMs)];
    const focus = plan.config.mode === 'wait' || position < (group?.endMs ?? 0) ? group : undefined;
    const cursor = plan.config.mode === 'wait' ? group?.atMs ?? plan.durationMs : Math.max(0, position);
    const visit = plan.visits?.[floorIndex(plan.visits, cursor, v => v.startMs)];
    const loop = plan.loops[floorIndex(plan.loops, cursor, l => l.startMs)]?.index ?? 0;
    return {focus, cursor, pass: visit?.pass ?? loop, visit};
  }
  markers(pass: number, focus: Plan['groups'][number] | undefined, core?: CoreState): Map<string, Marker> {
    const markers = new Map<string, Marker>(), assessments = new Map(core?.assessments.map(a => [a.targetId, a]));
    const live = new Map(core?.live?.filter(f => f.targetId && f.state === 'matched').map(f => [f.targetId!, f]));
    const current = new Set(focus?.targets.map(t => t.id));
    for (const {target, anchors} of this.passes.get(pass) ?? []) {
      const assessment = assessments.get(target.id), pending = live.get(target.id);
      let marker: Marker | undefined;
      if (assessment) marker = assessment.status === 'missed' ? {kind: 'miss', label: 'thiếu nốt', symbol: '×'}
        : {kind: assessment.grade === 'outside' ? 'timing' : 'hit', label: 'đúng nốt' + timingLabel(assessment.deltaMs), symbol: assessment.grade === 'outside' ? '!' : '✓'};
      else if (pending) marker = {kind: pending.grade === 'outside' ? 'timing' : 'pending', label: 'đã nhận nốt · đang ghép' + timingLabel(pending.deltaMs), symbol: '•', provisional: true};
      else if (current.has(target.id)) marker = {kind: 'current', label: 'nốt cần chơi', symbol: '▼'};
      if (marker) for (const anchor of anchors) markers.set(anchor, marker);
    }
    return markers;
  }
}
