import type {Timeline} from './model';

// Tempo is data, not a distance between adjacent clicks: an A–B break or a
// partial final beat does not change it. Older saved timelines retain their
// configured loop tempo when no native tempo map was recorded.
export function tempoAt(t:Timeline,position:number):number {
  const points=t.tempos;
  if(points?.length){
    let lo=0,hi=points.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(points[mid].atMs<=position)lo=mid+1;else hi=mid;}
    return points[Math.max(0,lo-1)].bpm;
  }
  const loop=t.visits.findLast(v=>v.startMs<=position)?.loop??0;
  return t.settings.bpm+loop*t.settings.loopBpmStep;
}
