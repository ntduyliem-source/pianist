// MIT, Copyright (c) 2014 Colin Raffel. Mechanical port of mir_eval
// fe73b353: transcription.match_note_offsets/match_notes/precision_recall_f1_overlap
// and util._bipartite_match/f_measure. Full license and original Python are in
// third_party/practice-sources/mir_eval. All times in this module are SECONDS.
export type Interval = readonly [number, number];

// np.around(..., decimals=4): ties to even, unlike JS Math.round.
export function roundedDistance(a: number, b: number): number {
  const x = Math.abs(a - b) * 10000, floor = Math.floor(x), fraction = x - floor;
  return (fraction < .5 ? floor : fraction > .5 ? floor + 1 : floor + floor % 2) / 10000;
}
export const offsetTolerance = (ref: Interval) => Math.max(.2 * (ref[1] - ref[0]), .05);
// Singleton match_note_offsets. Association is supplied by osu, never rematched
// to a different note by this offset-only diagnostic.
export const offsetMatches = (ref: Interval, actualEnd: number) => roundedDistance(ref[1], actualEnd) <= offsetTolerance(ref);

export function bipartiteMatch(graph: Map<number, number[]>): Map<number, number> {
  const matching = new Map<number, number>();
  for (const [u, neighbors] of graph) for (const v of neighbors) if (!matching.has(v)) {matching.set(v, u); break;}
  while (true) {
    const preds = new Map<number, number[]>(), unmatched: number[] = [];
    const pred = new Map<number, number | number[]>();
    for (const u of graph.keys()) pred.set(u, unmatched);
    for (const u of matching.values()) pred.delete(u);
    let layer = [...pred.keys()];
    while (layer.length && !unmatched.length) {
      const newLayer = new Map<number, number[]>();
      for (const u of layer) for (const v of graph.get(u)!) if (!preds.has(v)) {
        const list = newLayer.get(v) ?? []; list.push(u); newLayer.set(v, list);
      }
      layer = [];
      for (const [v, list] of newLayer) {
        preds.set(v, list);
        if (matching.has(v)) {layer.push(matching.get(v)!); pred.set(matching.get(v)!, v);}
        else unmatched.push(v);
      }
    }
    if (!unmatched.length) return matching;
    const recurse = (v: number): boolean => {
      if (preds.has(v)) {
        const list = preds.get(v)!; preds.delete(v);
        for (const u of list) if (pred.has(u)) {
          const pu = pred.get(u)!; pred.delete(u);
          if (pu === unmatched || recurse(pu as number)) {matching.set(v, u); return true;}
        }
      }
      return false;
    };
    for (const v of unmatched) recurse(v);
  }
}

export function matchNotes(ref: readonly Interval[], refPitchHz: readonly number[], est: readonly Interval[], estPitchHz: readonly number[], onsetTolerance = .05): [number, number][] {
  const graph = new Map<number, number[]>();
  const ordered=est.map((p,index)=>({on:p[0],index})).sort((a,b)=>a.on-b.on||a.index-b.index);
  // The original np.where traverses the reference-major matrix. Keep its
  // insertion/neighbor order so ambiguous maximum matchings agree exactly.
  for (let r = 0; r < ref.length; r++) {
    // Sparse enumeration only: every distance outside this conservative bound
    // is false in the original rounded onset matrix. Restore np.where order.
    const loTime=ref[r][0]-onsetTolerance-.0001,hiTime=ref[r][0]+onsetTolerance+.0001;
    let lo=0,hi=ordered.length;while(lo<hi){const mid=(lo+hi)>>>1;if(ordered[mid].on<loTime)lo=mid+1;else hi=mid;}
    const candidates:number[]=[];for(let i=lo;i<ordered.length&&ordered[i].on<=hiTime;i++)candidates.push(ordered[i].index);
    candidates.sort((a,b)=>a-b);
    for(const e of candidates){
    if (roundedDistance(ref[r][0], est[e][0]) <= onsetTolerance
      && Math.abs(1200 * (Math.log2(refPitchHz[r]) - Math.log2(estPitchHz[e]))) <= 50
      && offsetMatches(ref[r], est[e][1])) {
      const neighbors = graph.get(e) ?? []; neighbors.push(r); graph.set(e, neighbors);
    }
    }
  }
  return [...bipartiteMatch(graph)].sort((a, b) => a[0] - b[0]);
}

export function precisionRecallOverlap(ref: readonly Interval[], est: readonly Interval[], matching: readonly [number, number][]) {
  if (!ref.length || !est.length) return {precision: 0, recall: 0, f1: 0, overlap: 0};
  const precision = matching.length / est.length, recall = matching.length / ref.length;
  const f1 = precision === 0 && recall === 0 ? 0 : 2 * precision * recall / (precision + recall);
  const overlap = matching.length ? matching.reduce((sum, [r, e]) => sum +
    (Math.min(ref[r][1], est[e][1]) - Math.max(ref[r][0], est[e][0])) /
    (Math.max(ref[r][1], est[e][1]) - Math.min(ref[r][0], est[e][0])), 0) / matching.length : 0;
  return {precision, recall, f1, overlap};
}

// Piano transcription pedal-event profile, calculate_score_for_paper.py
// 1ade7dc::ScoreCalculator.calculate_score: constant pitches, onset 0.2s,
// offset_ratio 0.2, offset_min_tolerance 0.05. No composite piano score.
export function pedalMetrics(ref: readonly Interval[], est: readonly Interval[]) {
  const matching = matchNotes(ref, ref.map(() => 1), est, est.map(() => 1), .2);
  return {matching, ...precisionRecallOverlap(ref, est, matching)};
}
