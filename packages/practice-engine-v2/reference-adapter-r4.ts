// Identity/time conversion only. All reference key offsets come from MuseScore
// MPE (CompatMidiRender for historical snapshots); pedal spans come from its
// score DOM and RepeatList.
import type {ScoreSnapshot} from '../score-contracts';
import type {Timeline, PedalTarget} from './model';
import {nativeVisitClock} from './native-time';

export function attachReleaseReferences(score:ScoreSnapshot,t:Timeline):void {
  const anchors=new Map(score.anchors.map(a=>[a.id,a]));
  const occurrences=new Map(score.occurrences.map(o=>[o.index,o]));
  const measures=new Map(score.measures.map(m=>[m.index,m]));
  const releases=new Map<string,NonNullable<ScoreSnapshot['keyReleases']>>();
  for(const release of score.keyReleases??[]){const list=releases.get(release.anchor)??[];list.push(release);releases.set(release.anchor,list);}
  const quarter=(loop:number)=>60000/((t.settings.bpm+loop*t.settings.loopBpmStep)*t.settings.beatQuarter);
  const scale=(loop:number)=>score.baseQuarterBpm/((t.settings.bpm+loop*t.settings.loopBpmStep)*t.settings.beatQuarter);
  for(const target of t.targets){
    if(score.performance)continue; // MPE already supplied the exact key release.
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
      if(r.velocity!==undefined)target.velocity=Math.max(target.velocity??0,r.velocity);
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
  t.pedalReference=score.durationReference==='musescore-midi'&&parts.size>0;
  t.pedals=[];
  if(!t.pedalReference)return;
  const byOccurrence=new Map<number,NonNullable<ScoreSnapshot['pedals']>>();
  for(const p of score.pedals??[])if(parts.has(p.partId)){const list=byOccurrence.get(p.occurrence)??[];list.push(p);byOccurrence.set(p.occurrence,list);}
  const previous=new Map<string,{target:PedalTarget;occurrence:number}>();
  for(const visit of t.visits){
    const o=occurrences.get(visit.occurrence)!,m=measures.get(visit.measure)!;
    const clock=nativeVisitClock(score,t.settings,o,visit.loop);
    for(const p of byOccurrence.get(visit.occurrence)??[]){
      const atMs=visit.startMs+clock.at(p.atMs,o.utick+p.tick-m.tick);
      const endMs=visit.startMs+clock.at(p.endMs,o.utick+p.endTick-m.tick);
      const key=`${visit.loop}:${p.id}`,prior=previous.get(key);
      if(prior&&prior.occurrence+1===visit.occurrence&&Math.abs(prior.target.endMs-atMs)<1e-6){prior.target.endMs=endMs;prior.occurrence=visit.occurrence;}
      else{const target={id:`${key}:${visit.id}`,atMs,endMs,loop:visit.loop};t.pedals.push(target);previous.set(key,{target,occurrence:visit.occurrence});}
    }
  }
  t.pedals.sort((a,b)=>a.atMs-b.atMs||a.endMs-b.endMs);
  // The two staves can be stored as separate piano parts. Their overlapping
  // pedal instructions still describe one physical sustain pedal.
  const physical:PedalTarget[]=[];
  for(const pedal of t.pedals){const last=physical.at(-1);
    // Equality is a real off/on pedal change, not an overlapping hold.
    if(last&&last.loop===pedal.loop&&pedal.atMs<last.endMs)last.endMs=Math.max(last.endMs,pedal.endMs);
    else physical.push({...pedal});}
  t.pedals=physical;
}
