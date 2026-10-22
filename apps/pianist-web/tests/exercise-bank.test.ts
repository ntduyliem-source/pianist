import test from 'node:test';
import assert from 'node:assert/strict';
import {ExerciseSelector} from '../src/exercises/selector';
import {checked,sha,safePath,validateIndex,validateEntries,loadBank,type Exercise,type BankIndex,type Option} from '../src/exercises/bank';
import {exerciseSettings,readSelection,DEFAULT_SELECTION} from '../src/exercises/settings';
import {createTimeline} from '../../../packages/practice-engine-v2/score-adapter';
import {scoreFixture} from './helpers/fixtures-v2';
const entry=(id:string,bucket='n4',position=1,source=id,motif=id)=>({id,scoreId:'g1-'+bucket+'-'+String(position).padStart(3,'0'),lengthBucket:bucket,bookPosition:position,motifGroupId:motif,sourceId:source,hand:'both',beatQuarter:[1]} as Exercise);
test('random rounds include every ID exactly once and label the next round explicitly',()=>{
  const entries=Array.from({length:300},(_,i)=>entry(String(i)));
  const selector=new ExerciseSelector(entries,true,()=>.7);
  for(let round=1;round<=3;round++){
    const items=Array.from({length:300},()=>selector.take()!);
    assert.equal(new Set(items.map(x=>x.entry.id)).size,300);
    assert.ok(items.every(x=>x.round===round&&x.total===300));
    assert.deepEqual(items.map(x=>x.position),Array.from({length:300},(_,i)=>i+1));
  }
});
test('ordered selection alternates sorted length buckets and preserves authored book positions',()=>{
  const selector=new ExerciseSelector([entry('six2','n6',2),entry('four2','n4',2),entry('six1','n6',1),entry('four1','n4',1)],false);
  const items=Array.from({length:6},()=>selector.take()!);
  assert.deepEqual(items.map(x=>x.entry.id),['four1','six1','four2','six2','four1','six1']);
  assert.deepEqual(items.map(x=>[x.round,x.position]),[[1,1],[1,2],[1,3],[1,4],[2,1],[2,2]]);
});
test('shuffle avoids adjacent versions of a study/motif when alternatives remain, including round boundaries',()=>{
  const selector=new ExerciseSelector([entry('a','n4',1,'study','motif'),entry('b','n6',1,'study','motif'),entry('c','n4',2,'other','other')],true,()=>0);
  assert.deepEqual(Array.from({length:4},()=>selector.take()!.entry.id),['a','c','b','c']);
});
test('deduplication, empty and one-item selections remain finite per round without dropping sparse choices',()=>{
  assert.equal(new ExerciseSelector([],true).take(),undefined);
  const selector=new ExerciseSelector([entry('one'),entry('one')],false);
  assert.deepEqual([selector.take(),selector.take()].map(x=>[x!.entry.id,x!.round,x!.total]),[['one',1,1],['one',2,1]]);
});
test('selection preferences sanitize storage and retain an intentionally empty multi-selection',()=>{
  assert.deepEqual(readSelection(undefined),DEFAULT_SELECTION);
  assert.deepEqual(readSelection({grade:9,hand:'any',mode:'x',bpm:Infinity,lengths:['n6','n4','n6','xxx'],random:false}),{...DEFAULT_SELECTION,lengths:['n4','n6'],random:false});
  assert.deepEqual(readSelection({lengths:[]}).lengths,[]);
  assert.equal(readSelection({bpm:500}).bpm,300);
  assert.equal(readSelection({grade:8,hand:'left',mode:'wait'}).hand,'left');
});
test('fetched assets reject corruption, invalid hash and path traversal',async()=>{
  const bytes=new TextEncoder().encode('fixture'),asset={path:'exercises/n.mxl',bytes:bytes.length,sha256:await sha(bytes)};
  assert.equal(await checked(bytes,asset),bytes);
  await assert.rejects(checked(bytes,{...asset,sha256:'0'.repeat(64)}));
  await assert.rejects(checked(bytes,{...asset,bytes:1}));
  for(const path of ['../foo','a/../foo','/foo','https://host/file','a\\b','a//b','a/./b'])assert.equal(safePath(path),false,path);
});
function grandStaff(){const s=scoreFixture();s.staves.push({id:1,part:'Piano',partId:'p'});s.anchors.push({...s.anchors[0],id:'bass',staff:1,visualStaff:1,track:4,pitch:48});s.performed.push({...s.performed[0],anchor:'bass'});return s;}
test('two-hand source retains both staves and all voices while selected hand changes only grading targets',()=>{
  const score=grandStaff(),e=entry('both');
  const both=exerciseSettings(score,e,{mode:'wait',bpm:70},'piano-midi');
  assert.deepEqual(both.roles,{0:'right',1:'left'});assert.deepEqual(both.voices,[0,1,2,3]);assert.equal(both.inputSource,'midi');assert.equal(both.loops,1);
  assert.equal(createTimeline(score,both).targets.length,2);
  for(const hand of ['right','left'] as const){const config=exerciseSettings(score,e,{mode:'wait',bpm:70,hand},'virtual');const timeline=createTimeline(score,config);assert.equal(timeline.targets.length,1);assert.equal(timeline.targets[0].pitch,hand==='right'?60:48);assert.equal(score.staves.length,2);assert.deepEqual(config.roles,both.roles);}
});
test('compound beat unit is preserved for 6/8 practice',()=>{
  const config=exerciseSettings(grandStaff(),{...entry('compound'),beatQuarter:[1.5]},{mode:'bpm',bpm:60,hand:'left'},'virtual');
  assert.equal(config.beatQuarter,1.5);assert.equal(config.bpm,60);assert.equal(config.hand,'left');
});
function indexFixture():BankIndex{
  const lengthBuckets=[[4,3,5],[6,6,8],[10,9,14],[20,15,24],[30,25,39],[50,40,69],[100,70,120]].map(([n,min,max])=>({id:'n'+n,label:'~'+n,min,max}));
  const options=Array.from({length:8},(_,i)=>lengthBuckets.map(b=>({grade:i+1,lengthBucket:b.id,count:i===0&&b.id==='n4'?1:0,byHand:{both:i===0&&b.id==='n4'?1:0,right:0,left:0},path:`options/g${i+1}-${b.id}.json`,bytes:1,sha256:'a'.repeat(64)}))).flat();
  return {schemaVersion:1,kind:'composed-abc-v1',releaseId:'web-'+'a'.repeat(20),sourceRelease:'composed',visibility:'composed',total:1,minimum:100,lengthBuckets,options};
}
function validEntry():Exercise{const id='b'.repeat(64);return {...entry(id),sha256:id,path:'exercises/'+id+'.mxl',bytes:1,targetCount:4,countRight:2,countLeft:2,abcSha256:'c'.repeat(64),grades:[1],profiles:['g1'],title:'G1 first',sourceMeasures:[1,1],sources:[]};}
test('new catalog rejects legacy K5 metadata, broken totals and missing two-staff counts',()=>{
  const index=indexFixture();assert.equal(validateIndex(index),index);
  assert.throws(()=>validateIndex({...index,kind:undefined} as unknown as BankIndex));
  assert.throws(()=>validateIndex({...index,total:2}));
  assert.throws(()=>validateIndex({...index,options:index.options.map((o,i)=>i?o:{...o,byHand:{both:0,left:1,right:0}})}));
  const e=validEntry();assert.equal(validateEntries([e],index,index.options[0])[0],e);
  for(const patch of [{hand:'right'},{countLeft:0},{countRight:4},{lengthBucket:'n6'},{bookPosition:0},{bookPosition:2},{scoreId:'g2-n4-001'},{sha256:'d'.repeat(64)}])assert.throws(()=>validateEntries([{...e,...patch} as Exercise],index,index.options[0]));
});
test('hosted loader ignores any old device bank and verifies its new manifest, index and option',async()=>{
  const index=indexFixture(),e=validEntry(),encode=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
  const option=encode({releaseId:index.releaseId,grade:1,lengthBucket:'n4',entries:[e]});
  index.options[0]={...index.options[0],bytes:option.length,sha256:await sha(option)};
  const raw=encode(index),path=index.releaseId+'/index.json';
  const manifest=encode({schemaVersion:1,releaseId:index.releaseId,index:{path,bytes:raw.length,sha256:await sha(raw)}});
  const prior={fetch:globalThis.fetch,location:globalThis.location,indexedDB:globalThis.indexedDB};
  const calls:string[]=[];
  Object.assign(globalThis,{location:{href:'http://localhost/pianist.html#/practice'},indexedDB:{open(){throw Error('Old bank must not be read');}},fetch:async(input:URL)=>{calls.push(String(input));return new Response(String(input).endsWith('manifest.json')?manifest:String(input).endsWith('index.json')?raw:option);}});
  try{const bank=await loadBank();assert.equal(bank.index.kind,'composed-abc-v1');assert.deepEqual(await bank.option(bank.index.options[0]),[e]);assert.equal(calls.length,3);assert.ok(calls.every(url=>url.startsWith('http://localhost/curriculum/')));}finally{Object.assign(globalThis,prior);}
});
