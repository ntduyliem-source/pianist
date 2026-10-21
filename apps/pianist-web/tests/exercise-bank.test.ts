import test from 'node:test';
import assert from 'node:assert/strict';
import {ExerciseSelector} from '../src/exercises/selector';
import {checked,sha,safePath,type Exercise} from '../src/exercises/bank';
import {exerciseSettings} from '../src/exercises/settings';
import {createTimeline} from '../../../packages/practice-engine-v2/score-adapter';
import {scoreFixture} from './helpers/fixtures-v2';
const entry=(id:string,motif=id,source=id)=>({id,motifGroupId:motif,sourceId:source,hand:'right',beatQuarter:[1]} as Exercise);
test('selection drains without repeating or silently looping sparse pools',()=>{
  const selector=new ExerciseSelector(Array.from({length:300},(_,i)=>entry(String(i))),[],()=>.7);
  const ids=Array.from({length:300},()=>selector.take()!.id);
  assert.equal(new Set(ids).size,300);assert.equal(selector.left,0);assert.equal(selector.take(),undefined);
  const one=new ExerciseSelector([entry('x')],[],()=>0);assert.equal(one.take()?.id,'x');assert.equal(one.take(),undefined);
});
test('unseen IDs first, then older; recently seen motifs/sources are avoided when alternatives exist',()=>{
  const history=[{id:'seen',motif:'m',source:'s',at:20},{id:'old',motif:'o',source:'o',at:10}];
  const selector=new ExerciseSelector([entry('seen','m','s'),entry('old'),entry('new','m','s'),entry('different')],history,()=>0);
  assert.equal(selector.take()?.id,'different');assert.equal(selector.take()?.id,'new');assert.equal(selector.take()?.id,'old');assert.equal(selector.take()?.id,'seen');
});
test('all fetched/imported assets reject corruption and path traversal',async()=>{
  const bytes=new TextEncoder().encode('fixture');const asset={path:'exercises/n.mxl',bytes:bytes.length,sha256:await sha(bytes)};
  assert.equal(await checked(bytes,asset),bytes);
  await assert.rejects(checked(bytes,{...asset,sha256:'0'.repeat(64)}));
  await assert.rejects(checked(bytes,{...asset,bytes:1}));
  for(const path of ['../foo','a/../foo','/foo','https://host/file','a\\b','a//b','a/./b'])assert.equal(safePath(path),false,path);
});
test('left-hand one-staff excerpts retain their targets and compound beat unit',()=>{
  const score=scoreFixture(),e={...entry('left'),hand:'left',beatQuarter:[1.5]} as Exercise;
  const config=exerciseSettings(score,e,{mode:'bpm',bpm:60},'virtual');
  assert.equal(config.roles[0],'left');assert.equal(config.hand,'left');assert.equal(config.beatQuarter,1.5);
  const timeline=createTimeline(score,config);assert.equal(timeline.targets.length,1);assert.equal(timeline.targets[0].pitch,60);
});
test('two-hand excerpt keeps both staff routes and every voice',()=>{
  const score=scoreFixture();score.staves.push({id:1,part:'Piano',partId:'p'});
  const config=exerciseSettings(score,{...entry('both'),hand:'both'},{mode:'wait',bpm:70},'piano-midi');
  assert.deepEqual(config.roles,{0:'right',1:'left'});assert.deepEqual(config.voices,[0,1,2,3]);assert.equal(config.inputSource,'midi');assert.equal(config.loops,1);
});
