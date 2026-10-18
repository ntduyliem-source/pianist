// Integration adapter: onset association stays in osu!mania. Offset decisions
// call the source-derived mir_eval predicate. Sustain is exclusively note-seq.
import type {AttemptResult, EngineView, KeyInterval, ReleaseJudgement, R4Report, Target, Timeline} from './model';
import {offsetMatches, offsetTolerance, pedalMetrics, type Interval} from './upstream/mir-eval';
import {applySustain} from './upstream/note-seq';
import type {Judgement} from './upstream/mania';

export function releaseJudgement(target:Target,j:Judgement,n:KeyInterval|undefined,processed:number,expected=target.releaseMs,actual=n?.keyOffMs,sound=false):ReleaseJudgement {
  const ref:Interval=[target.atMs/1000,(expected??target.atMs)/1000];
  const result:ReleaseJudgement={id:target.id,sequence:j.seq,expectedMs:expected??null,actualMs:actual??null,
    deltaMs:expected!==undefined&&actual!==undefined?actual-expected:null,toleranceMs:expected===undefined?null:offsetTolerance(ref)*1000,status:'pending'};
  if(expected===undefined||expected<=target.atMs)result.status='unavailable';
  else if(j.seq===null||j.grade==='miss'||!n||n.stateOnly)result.status='no-attack';
  else if(sound?n.interrupted:n.keyInterrupted)result.status=n.closedBy==='stop'?'unreleased':'interrupted';
  else if(actual===undefined)result.status=processed>expected+offsetTolerance(ref)*1000?'unreleased':'pending';
  else result.status=offsetMatches(ref,actual/1000)?'correct':actual<expected?'early':'late';
  return result;
}

export function releaseDeadline(t:Timeline):number {
  let deadline=t.durationMs;
  if(t.settings.mode!=='bpm')return deadline;
  if(t.settings.durationEnabled!==false)for(const n of t.targets)if(n.releaseMs!==undefined){
    deadline=Math.max(deadline,n.releaseMs+offsetTolerance([n.atMs/1000,n.releaseMs/1000])*1000+.1);
  }
  if(t.settings.pedalEnabled!==false)for(const p of t.pedals??[])deadline=Math.max(deadline,p.endMs+offsetTolerance([p.atMs/1000,p.endMs/1000])*1000+.1);
  if(t.settings.durationEnabled!==false&&t.settings.pedalEnabled!==false&&t.pedalReference){
    const sounding=applySustain(t.targets.filter(n=>n.releaseMs!==undefined).map(n=>({id:n.id,pitch:n.pitch,start:n.atMs,end:n.releaseMs!,instrument:'score'})),
      (t.pedals??[]).flatMap(p=>[{time:p.atMs,value:127,instrument:'score'},{time:p.endMs,value:0,instrument:'score'}]));
    for(const n of sounding)deadline=Math.max(deadline,n.end+offsetTolerance([n.start/1000,n.end/1000])*1000+.1);
  }
  return deadline;
}

export function assessReleases(t:Timeline,v:EngineView,outcome:AttemptResult['outcome']):R4Report {
  const bySequence=new Map(v.intervals.map(n=>[n.sequence,n]));
  const targets=new Map(t.targets.map(n=>[n.id,n]));
  const bpm=t.settings.mode==='bpm',pedalOn=t.settings.pedalEnabled!==false;
  const enabled=bpm&&t.settings.durationEnabled!==false;
  const key=enabled?v.judgements.map(j=>releaseJudgement(targets.get(j.id)!,j,bySequence.get(j.seq!),v.processedMs)):[];
  const pedalTargets=(t.pedals??[]).filter(p=>outcome==='complete'||p.atMs<=v.processedMs);
  const observed=(v.pedalIntervals??[]).filter(p=>!p.stateOnly&&p.onMs<=t.durationMs);
  const finished=observed.filter(p=>!p.interrupted&&p.offMs!==undefined&&p.offMs>p.onMs);
  const ref=pedalTargets.map(p=>[p.atMs/1000,p.endMs/1000] as Interval);
  const est=finished.map(p=>[p.onMs/1000,p.offMs!/1000] as Interval);
  const status=!bpm?'wait':!pedalOn?'disabled':!t.pedalReference||!pedalTargets.length?'no-reference':outcome!=='complete'||observed.length!==finished.length?'partial':'scored';
  // mir_eval validates nonnegative intervals. Translate the whole recording by
  // one common origin; count-in presses keep their true early delta.
  const shift=est.reduce((origin,p)=>Math.max(origin,-p[0]),0);
  const measured=pedalMetrics(ref.map(p=>[p[0]+shift,p[1]+shift]),est.map(p=>[p[0]+shift,p[1]+shift]));
  const pedal:R4Report['pedal']={status,reference:ref.length,performed:est.length,interrupted:observed.length-finished.length,
    ...(status==='scored'||status==='partial'?measured:{matching:[],precision:0,recall:0,f1:0,overlap:0}),targets:pedalTargets,intervals:finished};
  let sound:ReleaseJudgement[]=[];
  if(enabled&&pedalOn&&t.pedalReference&&pedalTargets.length){
    const refs=applySustain(t.targets.filter(n=>n.releaseMs!==undefined).map(n=>({id:n.id,pitch:n.pitch,start:n.atMs,end:n.releaseMs!,instrument:'score'})),
      (t.pedals??[]).flatMap(p=>[{time:p.atMs,value:127,instrument:'score'},{time:p.endMs,value:0,instrument:'score'}]));
    const actual=applySustain(v.intervals.filter(n=>n.keyOffMs!==undefined).map(n=>({id:String(n.sequence),pitch:n.pitch,start:n.onMs,end:n.keyOffMs!,instrument:`${n.portId}/${n.channel}`})),
      (v.controls??[]).map(c=>({time:c.atMs,value:c.value,instrument:`${c.portId}/${c.channel}`})));
    const refEnds=new Map(refs.map(n=>[n.id,n.end])),actualEnds=new Map(actual.map(n=>[+n.id,n.end]));
    sound=v.judgements.map(j=>{
      const n=bySequence.get(j.seq!);
      // Never let note-seq's end-of-file closure certify an unobserved release.
      const end=actualEnds.get(j.seq!);
      const retriggerClosed=n&&end!==undefined&&n.soundOffMs!==undefined&&end<n.soundOffMs;
      return releaseJudgement(targets.get(j.id)!,j,retriggerClosed?{...n,interrupted:false}:n,v.processedMs,refEnds.get(j.id),n?.soundOffMs===undefined?undefined:end,true);
    });
  }
  return {profile:'mir_eval-offset+note-seq+pedal-200ms',key,sound,pedal};
}
