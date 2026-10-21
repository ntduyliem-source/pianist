// Offline Q4 validation only. No product route or replacement grading logic.
import {EngineBridge,type NativeApi} from '../../../packages/engine-bridge';
import {ExerciseRenderer} from '../../../packages/exercise-renderer';
import {createTimeline,settingsFor} from '../../../packages/practice-engine-v2/score-adapter';
import {exerciseCounts} from '../../../packages/exercise-generator/contract';
import {validatePreparedCatalog,preparedTimeline} from '../../../packages/exercise-generator/prepared-contract';
import type {ScoreSnapshot} from '../../../packages/score-contracts';
const renderer=new ExerciseRenderer();
const bridge=()=>{
  const b=new EngineBridge((window as any).pianist as NativeApi);b.revision=b.semantics().revision;return b;
};
async function render(input:{bytes:number[];name:string;hand?:'left'|'right'}){
  const b=bridge(),before=JSON.stringify(b.semantics());
  const result=await renderer.prepare(new Uint8Array(input.bytes),input.name);
  const snapshot:ScoreSnapshot={...result.snapshot,projectId:input.name,fingerprint:result.sourceHash};
  const roles=Object.fromEntries(snapshot.staves.map((s,i)=>[s.id,input.hand??(i===0?'right':'left')]));
  const timeline=createTimeline(snapshot,{...settingsFor(snapshot),roles,bpm:60,beatQuarter:1,countIn:0,loops:1,tempoMode:'fixed'});
  const glyphs=new Set(snapshot.pages.flatMap(p=>[...new DOMParser().parseFromString(p.svg,'image/svg+xml')
    .querySelectorAll('[data-practice-notes]')].flatMap(e=>e.getAttribute('data-practice-notes')!.split(/\s+/))));
  const missing=snapshot.anchors.filter(a=>a.visible&&!glyphs.has(a.id.replace(/^m\d+-/,'')));
  if(missing.length)throw Error('missing-native-glyph:'+missing.map(a=>a.id));
  const editorUnchanged=before===JSON.stringify(b.semantics());
  if(!editorUnchanged)throw Error('temporary-render-mutated-editor');
  const beats={schemaVersion:2,engine:timeline.engine,beatUnitQuarter:1,durationQuarter:timeline.durationMs/1000,
    targets:timeline.targets.map(t=>({id:t.id,pitch:t.pitch,atQuarter:t.atMs/1000,endQuarter:t.endMs/1000,
      releaseQuarter:t.releaseMs===undefined?undefined:t.releaseMs/1000,anchors:t.anchors}))};
  return {snapshot,timeline:beats,counts:exerciseCounts(timeline),glyphsComplete:true,editorUnchanged,
    sourceHash:result.sourceHash,rendererVersion:result.rendererVersion,elapsedMs:result.elapsedMs,
    systems:new Set(snapshot.measures.map(m=>m.page+':'+m.box.y)).size};
}
async function validateCatalog(url:string){
  const response=await fetch(url);if(!response.ok)throw Error('catalog-http');
  const catalog:unknown=await response.json();validatePreparedCatalog(catalog);
  const rows=[];
  for(const entry of catalog.entries){
    const assets:Record<string,Uint8Array>={};
    for(const [kind,asset] of Object.entries(entry.assets)){
      const res=await fetch(new URL(asset.path,new URL(url,location.href)));if(!res.ok)throw Error('asset-http');
      const bytes=new Uint8Array(await res.arrayBuffer());
      const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
      if(sha!==asset.sha256||bytes.length!==asset.bytes)throw Error('catalog-asset-hash');assets[kind]=bytes;
    }
    const snapshot=JSON.parse(new TextDecoder().decode(assets.snapshot));
    const t=preparedTimeline(snapshot,entry,60),beats=JSON.parse(new TextDecoder().decode(assets.timeline));
    if(beats.engine!==t.engine||beats.targets.length!==t.targets.length||Math.abs(beats.durationQuarter*1000-t.durationMs)>1e-6)
      throw Error('prepared-beat-timeline-parity');
    for(const [i,n] of t.targets.entries()){
      const b=beats.targets[i];
      if(n.id!==b.id||n.pitch!==b.pitch||JSON.stringify(n.anchors)!==JSON.stringify(b.anchors)
        ||Math.abs(n.atMs-b.atQuarter*1000)>1e-6||Math.abs(n.endMs-b.endQuarter*1000)>1e-6
        ||(n.releaseMs===undefined)!==(b.releaseQuarter===undefined)
        ||n.releaseMs!==undefined&&Math.abs(n.releaseMs-b.releaseQuarter*1000)>1e-6)throw Error('prepared-beat-timeline-parity');
    }
    for(const bpm of [entry.bpm.min,entry.bpm.max])preparedTimeline(snapshot,entry,bpm);
    rows.push({id:entry.id,counts:exerciseCounts(t),hand:entry.hand,bucket:entry.lengthBucket});
  }
  return {passed:true,corpusVersion:catalog.corpusVersion,entries:rows};
}
(window as any).q4Lab={render,validateCatalog};
