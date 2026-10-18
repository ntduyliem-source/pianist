// Identity/time conversion only. All reference key offsets come from MuseScore
// CompatMidiRender; pedal spans come from its score DOM and RepeatList.
import type {ScoreSnapshot} from '../score-contracts';
import type {Timeline, PedalTarget} from './model';

export function attachReleaseReferences(score:ScoreSnapshot,t:Timeline):void {
  const anchors=new Map(score.anchors.map(a=>[a.id,a]));
  const occurrences=new Map(score.occurrences.map(o=>[o.index,o]));
  const measures=new Map(score.measures.map(m=>[m.index,m]));
  const releases=new Map<string,NonNullable<ScoreSnapshot['keyReleases']>>();
  for(const release of score.keyReleases??[]){const list=releases.get(release.anchor)??[];list.push(release);releases.set(release.anchor,list);}
  const quarter=(loop:number)=>60000/((t.settings.bpm+loop*t.settings.loopBpmStep)*t.settings.beatQuarter);
  const scale=(loop:number)=>score.baseQuarterBpm/((t.settings.bpm+loop*t.settings.loopBpmStep)*t.settings.beatQuarter);
  for(const target of t.targets){
    const first=t.visits[target.spans[0].visit],o=occurrences.get(first.occurrence)!,m=measures.get(first.measure)!;
    const onsetTick=o.utick+anchors.get(target.spans[0].anchor)!.tick-m.tick;
    const ends:number[]=[];
    for(const id of target.anchors){
      let a=anchors.get(id)!;const seen=new Set<string>();
      if(a.arpeggio)continue;
      while(a.tieBack&&anchors.has(a.tieBack)&&!seen.has(a.id)){seen.add(a.id);a=anchors.get(a.tieBack)!;}
      const candidates=(releases.get(a.id)??[]).filter(r=>r.pitch===target.pitch&&r.utick<=onsetTick+1e-6&&r.endUtick>onsetTick);
      // Multiple ornaments/re-articulations have no single key-release reference.
      if(candidates.length!==1)continue;
      const r=candidates[0];let last=first;
      if((releases.get(a.id)??[]).filter(event=>event.utick>=r.utick&&event.utick<r.utick+a.durationTicks).length!==1)continue;
      for(let i=first.id;i<t.visits.length;i++){
        const v=t.visits[i],native=occurrences.get(v.occurrence)!,measure=measures.get(v.measure)!;
        if(v.loop!==first.loop||i>first.id&&(v.occurrence!==last.occurrence+1||native.utick!==occurrences.get(last.occurrence)!.utick+measures.get(last.measure)!.endTick-measures.get(last.measure)!.tick))break;
        last=v;
        if(r.endUtick<=native.utick+measure.endTick-measure.tick){
          ends.push(v.startMs+(t.settings.tempoMode==='fixed'?(r.endUtick-native.utick)/480*quarter(v.loop):(r.endMs-native.startMs)*scale(v.loop)));break;
        }
        const next=t.visits[i+1];
        if(!next||next.loop!==v.loop||next.occurrence!==v.occurrence+1){ends.push(v.endMs);break;}
      }
    }
    if(ends.length)target.releaseMs=Math.max(target.atMs,Math.max(...ends));
  }
  const parts=new Set(t.targets.flatMap(n=>n.anchors).filter(id=>{
    const a=anchors.get(id)!,role=t.settings.roles[a.staff];
    return t.settings.voices.includes(a.voice)&&role!=='off'&&(t.settings.hand==='both'||role===t.settings.hand);
  }).map(id=>score.staves.find(s=>s.id===anchors.get(id)!.staff)!.partId));
  t.pedalReference=score.durationReference==='musescore-midi'&&parts.size===1;
  t.pedals=[];
  if(!t.pedalReference)return;
  const byOccurrence=new Map<number,NonNullable<ScoreSnapshot['pedals']>>();
  for(const p of score.pedals??[])if(parts.has(p.partId)){const list=byOccurrence.get(p.occurrence)??[];list.push(p);byOccurrence.set(p.occurrence,list);}
  const previous=new Map<string,{target:PedalTarget;occurrence:number}>();
  for(const visit of t.visits){
    const o=occurrences.get(visit.occurrence)!,m=measures.get(visit.measure)!;
    for(const p of byOccurrence.get(visit.occurrence)??[]){
      const atMs=visit.startMs+(t.settings.tempoMode==='fixed'?(p.tick-m.tick)/480*quarter(visit.loop):(p.atMs-o.startMs)*scale(visit.loop));
      const endMs=visit.startMs+(t.settings.tempoMode==='fixed'?(p.endTick-m.tick)/480*quarter(visit.loop):(p.endMs-o.startMs)*scale(visit.loop));
      const key=`${visit.loop}:${p.id}`,prior=previous.get(key);
      if(prior&&prior.occurrence+1===visit.occurrence&&Math.abs(prior.target.endMs-atMs)<1e-6){prior.target.endMs=endMs;prior.occurrence=visit.occurrence;}
      else{const target={id:`${key}:${visit.id}`,atMs,endMs,loop:visit.loop};t.pedals.push(target);previous.set(key,{target,occurrence:visit.occurrence});}
    }
  }
  t.pedals.sort((a,b)=>a.atMs-b.atMs||a.endMs-b.endMs);
}
