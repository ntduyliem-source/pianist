import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {decodeNativePracticeSnapshot,type ScoreSnapshot} from '../../../packages/score-contracts';
import {createTimeline,settingsFor} from '../../../packages/practice-engine-v2/score-adapter';
import {PracticeEngine} from '../../../packages/practice-engine-v2/engine';
import {resultFor} from '../../../packages/practice-engine-v2/results';
import type {MidiEvent,Timeline} from '../../../packages/practice-engine-v2/model';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const out=path.join(root,'artifacts/two-staff-upgrade');
const audit=JSON.parse(fs.readFileSync(path.join(out,'native-audit.json'),'utf8'));
assert(audit.passed,'Run two-staff-upgrade.cjs successfully first');
const results:any[]=[];
function play(t:Timeline){
 const engine=new PracticeEngine(t);
 // A physical key must be released before another strike. This is test MIDI
 // generation only; native offsets and the assessment thresholds stay intact.
 const nextOn=new Map<number,number>(),offs=new Map<string,number>();
 for(const n of [...t.targets].reverse()){
  offs.set(n.id,Math.min(n.releaseMs??n.endMs,nextOn.get(n.pitch)??Infinity));nextOn.set(n.pitch,n.atMs);
 }
 const events=t.targets.flatMap(n=>[
  {kind:'on',pitch:n.pitch,value:90,timestampMs:n.atMs},
  {kind:'off',pitch:n.pitch,value:0,timestampMs:offs.get(n.id)!},
 ]);
 for(const p of t.pedals??[])events.push({kind:'pedal',pitch:64,value:127,timestampMs:p.atMs},{kind:'pedal',pitch:64,value:0,timestampMs:p.endMs});
 events.sort((a,b)=>a.timestampMs-b.timestampMs||(a.kind==='off'?-1:b.kind==='off'?1:0));
 events.forEach((e,i)=>engine.input({...e,kind:e.kind as MidiEvent['kind'],sequence:i+1,receivedMs:e.timestampMs,portId:'virtual',source:'virtual',channel:0}));
 engine.clock(t.durationMs+30000);
 const r=resultFor(t,engine.view(),'Native capture','complete',t.durationMs+30000);
 assert.equal(r.metrics.hits,t.targets.length,'Native attack missed by scorer');assert.equal(r.metrics.misses,0);assert.equal(r.metrics.extras,0);
 assert.equal(r.metrics.evaluated,t.targets.length);
 if(t.settings.mode==='bpm')assert(r.r4!.key.every(k=>k.status==='correct'||k.status==='unavailable'), 'A playable native key release was misgraded');
 return {targets:t.targets.length,perfect:r.metrics.grades.perfect,releaseUnavailable:r.r4?.key.filter(k=>k.status==='unavailable').length??0,
  releaseCorrect:r.r4?.key.filter(k=>k.status==='correct').length??0,pedals:t.pedals?.length??0};
}
for(const row of audit.results){
 try{
  const text=fs.readFileSync(path.join(out,'native',row.id+'.json'),'utf8');
  const s={...decodeNativePracticeSnapshot(text),projectId:row.id,fingerprint:row.id} as ScoreSnapshot;
  const cases=[];
  for(const mode of ['bpm','wait'] as const)for(const tempoMode of ['fixed','score'] as const){
   const t=createTimeline(s,{...settingsFor(s),mode,tempoMode,countIn:0});
   const nativeKeys=new Set(s.performance!.events.filter(n=>n.spans.length&&n.atMs<s.occurrences.at(-1)!.endMs&&n.endMs>0).map(n=>n.pitch+'/'+n.atMs));
   assert.equal(t.targets.length,nativeKeys.size,'Native attacks omitted or duplicated');
   cases.push({mode,tempoMode,...play(t)});
  }
  const note=s.anchors.find(n=>n.grace)??s.anchors[Math.floor(s.anchors.length/2)];
  if(note){
   const t=createTimeline(s,{...settingsFor(s),mode:'bpm',tempoMode:'score',fromMeasure:note.measure,toMeasure:Math.min(s.measures.length-1,note.measure+1),loops:2,loopBpmStep:5,countIn:0});
   assert(t.targets.some(n=>n.loop===1));cases.push({mode:'bpm',tempoMode:'score',range:[t.settings.fromMeasure,t.settings.toMeasure],...play(t)});
  }
  results.push({id:row.id,title:row.title,passed:true,cases});
  console.log(`${results.length}/${audit.results.length} ${row.title}: ${cases.length} grading cases passed`);
 }catch(e){results.push({id:row.id,title:row.title,passed:false,error:String(e)});console.error(row.title,String(e));}
}
const report={passed:results.every(r=>r.passed),editions:results.length,cases:results.reduce((n,r)=>n+(r.cases?.length??0),0),results};
fs.writeFileSync(path.join(out,'grading-audit.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,editions:report.editions,cases:report.cases,failed:results.filter(r=>!r.passed).length}));
if(!report.passed)process.exitCode=1;
