import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {zipSync} from 'fflate';
import {prepareScoreFile} from '../src/platform/files';
import {Workspace} from '../src/workspace';
import {EngineBridge, type NativeApi} from '../../../packages/engine-bridge';
import {CONVERTER_VERSION, type FormatResult} from '../../../packages/score-formats/model';
import type {ScoreConverter} from '../../../packages/score-formats';
import type {PracticeController} from '../src/practice/controller-v2';
import * as storage from '../src/platform/storage';

const encode=(text:string)=>new TextEncoder().encode(text);
const abc='X:1\nT:Bài tiếng Việt\nM:4/4\nL:1/4\nK:C\nC D E F |';
const xml='<score-partwise><part-list/><part id="P1"><measure number="1"><note><rest/><duration>1</duration></note></measure></part></score-partwise>';
const success:FormatResult={ok:true,text:xml,title:'Bài tiếng Việt',diagnostics:[],converter:CONVERTER_VERSION};
const converter:ScoreConverter={run:async()=>success};

test('all native formats bypass Python; ABC goes through conversion and generated XML validation',async()=>{
  const noPython:ScoreConverter={run:async()=>{throw Error('Native input must not start Python');}};
  for(const filename of ['a.musicxml','a.xml','a.mscx','a.mxl','a.mscz']) {
    const bytes=/\.(mxl|mscz)$/.test(filename)?zipSync({'score.musicxml':encode(xml)}):encode(xml);
    const prepared=await prepareScoreFile(bytes,filename,noPython);assert.equal(prepared.bytes,bytes);assert.equal(prepared.filename,filename);
  }
  const prepared=await prepareScoreFile(encode(abc),'Nhạc.ABC',converter);
  assert.equal(prepared.filename,'Nhạc.musicxml');assert.equal(prepared.title,'Bài tiếng Việt');assert.equal(new TextDecoder().decode(prepared.bytes),xml);
  await assert.rejects(prepareScoreFile(encode(abc+'\n'+abc),'book.abc',noPython),/2 bài/);
  await assert.rejects(prepareScoreFile(encode(xml),'fake.abc',noPython),/ABC hợp lệ/);
  await assert.rejects(prepareScoreFile(encode(abc),'fake.mxl',noPython),/ZIP/);
  await assert.rejects(prepareScoreFile(encode(abc),'a.abc',{run:async()=>({...success,text:'<!DOCTYPE x [<!ENTITY bad "x">]>'+xml})}),/entity/);
  await assert.rejects(prepareScoreFile(encode(abc),'a.abc',{run:async()=>({...success,text:'<html/>'})}),/MusicXML/);
});

function setup(t:TestContext, formats:ScoreConverter=converter) {
  const prior=Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{configurable:true,value:{setInterval:()=>0}});
  t.after(()=>{if(prior)Object.defineProperty(globalThis,'window',prior);else delete (globalThis as any).window;});
  const ws=new Workspace(formats),calls:{filename:string;bytes:Uint8Array}[]=[];
  (ws as any).diagnostic=()=>{};(ws as any).measureDiagnostic=()=>{};ws.notice=()=>{};ws.autosave=async()=>{};
  ws.navigate=view=>ws.patch({view});
  const api={Module:{},loadScoreData(bytes:Uint8Array,filename:string){calls.push({filename,bytes});return true;},setPracticeActive(){return 1;},
    serializeProject(){(api.Module as any).onProjectSerialized(Uint8Array.of(80,75,1,2));return 1;}};
  const bridge=ws.bridge=new EngineBridge(api as unknown as NativeApi);ws.ensureEngine=async()=>bridge;
  t.after(async()=>{if(ws.state.current)await storage.releaseProject(ws.state.current.id);});
  return {ws,calls,bridge,api};
}
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));

test('ABC imports once into native, retains source, saves MSCZ and reopens without reconversion',async t=>{
  let count=0;const {ws,calls}=setup(t,{run:async()=>{count++;return success;}});
  await ws.importFile(new File([abc],'source.abc'));
  assert.equal(count,1);assert.equal(calls[0].filename,'source.musicxml');assert.equal(ws.state.view,'editor');
  const record=await storage.get<storage.ProjectRecord>('projects',ws.state.current!.id);
  assert.equal(record!.title,'Bài tiếng Việt');assert.equal(record!.filename,'Bài tiếng Việt.mscz');
  assert.equal(record!.sourceName,'source.abc');assert.deepEqual(record!.source,encode(abc));assert.deepEqual(record!.bytes,Uint8Array.of(80,75,1,2));
  ws.patch({current:undefined});await ws.openProject(record!.id);assert.equal(count,1);assert.equal(calls.at(-1)!.filename,'Bài tiếng Việt.mscz');
});
test('conversion failure, cancellation and late completion leave current score and library unchanged',async t=>{
  let resolve!:(r:FormatResult)=>void;
  const {ws,calls}=setup(t,{run:()=>new Promise(r=>{resolve=r;})});
  const before=(await storage.list('projects')).length;
  const current:storage.ProjectRecord={id:'old-cancel',title:'Old',filename:'old.mscz',bytes:Uint8Array.of(1),revision:9,createdAt:0,updatedAt:0};
  ws.patch({current,revision:9});
  const opening=ws.importFile(new File([abc],'cancel.abc'));while(!resolve)await tick();
  ws.cancelOpen();resolve(success);await opening;
  assert.equal(ws.state.current,current);assert.equal(calls.length,0);assert.equal(ws.state.revision,9);assert.equal((await storage.list('projects')).length,before);
  const bad=new Workspace({run:async()=>{throw Error('unsupported rhythm');}});
  (bad as any).diagnostic=()=>{};bad.autosave=async()=>{};
  bad.patch({current});await assert.rejects(bad.importFile(new File([abc],'bad.abc')),/unsupported rhythm/);
  assert.equal(bad.state.current,current);assert.equal((await storage.list('projects')).length,before);
});
test('a newer import supersedes cancellable preparation; the old response cannot publish or clear its busy state',async t=>{
  const resolves:((r:FormatResult)=>void)[]=[];
  const {ws,calls}=setup(t,{run:()=>new Promise(r=>resolves.push(r))});
  const a=ws.importFile(new File([abc],'first.abc'));while(resolves.length<1)await tick();
  const b=ws.importFile(new File([abc],'second.abc'));while(resolves.length<2)await tick();
  resolves[0](success);await a;assert.ok(ws.state.busy);assert.equal(calls.length,0);
  resolves[1]({...success,title:'Second'});await b;
  assert.equal(ws.state.current!.title,'Second');assert.equal(calls.length,1);assert.equal(calls[0].filename,'second.musicxml');assert.equal(ws.state.busy,'');
});
test('active practice locks all ABC entry points, including a session that starts during conversion',async t=>{
  let resolve!:(r:FormatResult)=>void;
  const {ws,calls}=setup(t,{run:()=>new Promise(r=>{resolve=r;})});
  ws.session={status:'running'} as PracticeController;
  await assert.rejects(ws.importFile(new File([abc],'active.abc'),true),/Kết thúc lượt/);
  ws.session=undefined;const pending=ws.importFile(new File([abc],'race.abc'),true);while(!resolve)await tick();
  ws.session={status:'paused'} as PracticeController;resolve(success);await assert.rejects(pending,/Kết thúc lượt/);assert.equal(calls.length,0);
});
test('native import rejection retains prior project, read-only practice mode and project count',async t=>{
  const {ws,api,bridge}=setup(t);api.loadScoreData=()=>false;bridge.practiceActive=true;
  const current:storage.ProjectRecord={id:'old-native',title:'Old',filename:'old.mscz',bytes:Uint8Array.of(1),revision:4,createdAt:0,updatedAt:0};
  ws.patch({current});const count=(await storage.list('projects')).length;
  await assert.rejects(ws.importFile(new File([abc],'native-error.abc')),/Không mở/);
  assert.equal(ws.state.current,current);assert.equal(bridge.practiceActive,true);assert.equal((await storage.list('projects')).length,count);
});
