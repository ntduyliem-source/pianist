import test from 'node:test';
import assert from 'node:assert/strict';
import {Workspace} from '../src/workspace';
import type {EngineBridge} from '../../../packages/engine-bridge/index';
import type {PracticeController} from '../src/practice/controller-v2';
import 'fake-indexeddb/auto';
import {scoreFixture,timeline} from './helpers/fixtures-v2';
import {PracticeEngine} from '../../../packages/practice-engine-v2/engine';
import {resultFor} from '../../../packages/practice-engine-v2/results';
import {settingsFor} from '../../../packages/practice-engine-v2/score-adapter';
import * as storage from '../src/platform/storage';
import type {BundledScore} from '../src/platform/bundled-library';

test('editor-only bundled versions cannot enter practice through the card or editor shortcut',async()=>{
  const workspace=new Workspace(),bytes=new TextEncoder().encode('native score with grace');
  const sha=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
  const score:BundledScore={id:sha,sha256:sha,bytes:bytes.length,title:'Version two',filename:'Version two — v2.mxl',url:'library/songs/version-two-v2.mxl',practiceReady:false,practiceNotice:'Chưa hỗ trợ tập nốt hoa mỹ.'};
  workspace.patch({bundledScores:[score],current:{id:'limited-version',title:score.title,filename:'two.mscz',sourceName:score.filename,source:bytes,bytes:new Uint8Array(),revision:1,createdAt:0,updatedAt:0}});
  await assert.rejects(workspace.openBundledScore(score,true),/nốt hoa mỹ/);
  await assert.rejects(workspace.practice(),/nốt hoa mỹ/);
});

test('reselecting grade practice navbar never releases held MIDI during a running attempt',()=>{
  const workspace=new Workspace();workspace.patch({view:'practice',practiceKind:'grade'});workspace.session={status:'running'} as PracticeController;
  workspace.midi.release=()=>{throw Error('held input must survive');};
  assert.doesNotThrow(()=>workspace.navigate('practice'));assert.equal(workspace.state.view,'practice');
});

test('practice kind switches keep the editor project and open the matching selector',()=>{
  const workspace=new Workspace();let restored=0,disposed=0;
  const current={id:'free-song',title:'Library song',filename:'song.mscz',bytes:new Uint8Array([1]),revision:1,createdAt:0,updatedAt:0};
  workspace.patch({current,view:'practice',practicePicker:false});
  workspace.navigate=view=>workspace.patch({view});
  workspace.restoreExerciseEditor=()=>{restored++;};
  workspace.session={status:'finished',dispose:()=>{disposed++;}} as unknown as PracticeController;
  workspace.selectPracticeKind('grade');
  assert.equal(workspace.state.practiceKind,'grade');assert.equal(workspace.state.practicePicker,true);
  assert.equal(workspace.state.current,current);assert.equal(disposed,1);assert.equal(restored,1);
  workspace.selectPracticeKind('free');
  assert.equal(workspace.state.practiceKind,'free');assert.equal(workspace.state.current,current);
});

test('changing practice kind cannot dispose a running or paused attempt',()=>{
  const workspace=new Workspace();workspace.patch({practiceKind:'grade'});
  for(const status of ['counting','running','paused','interrupted'] as const){
    workspace.session={status,dispose:()=>{throw Error('Must preserve attempt');}} as unknown as PracticeController;
    assert.throws(()=>workspace.selectPracticeKind('free'),/Kết thúc lượt/);
    assert.equal(workspace.state.practiceKind,'grade');
  }
});

test('entering grade practice never replaces it with the current library score',async()=>{
  const workspace=new Workspace();workspace.patch({practiceKind:'grade'});
  let opened=0;
  workspace.openPractice=()=>{opened++;};workspace.practice=async()=>{throw Error('Must keep grade selector');};
  await workspace.enterPractice();assert.equal(opened,1);
});

test('exercise native audition borrows read-only audio and restores exact editor content without a library project',async()=>{
  const workspace=new Workspace(),loads:Uint8Array[]=[];
  const editor=new Uint8Array([1,2,3]),exercise=new Uint8Array([4,5]);let readOnly=false;
  const bridge={revision:7,get practiceActive(){return readOnly;},serialize:()=>editor.slice(),setPractice:(v:boolean)=>{readOnly=v;},audition:()=>{},auditionState:()=>({available:true}),
    api:{loadScoreData:(data:Uint8Array)=>{assert.equal(readOnly,false,'native requires write mode for document load');loads.push(data.slice());return true;}}} as unknown as EngineBridge;
  workspace.bridge=bridge;
  const project={id:'borrow-test',title:'Editor',filename:'edit.mscz',bytes:editor,revision:2,createdAt:0,updatedAt:0};
  workspace.patch({view:'practice',practiceKind:'grade',current:project,revision:2,recoveryRevision:2});
  await workspace.exerciseAudition(exercise,new AbortController().signal);
  assert.equal(workspace.state.current,project);assert.equal(readOnly,true);assert.equal(workspace.state.projects.length,0);
  workspace.restoreExerciseEditor();assert.deepEqual(loads,[exercise,editor]);assert.equal(workspace.state.current,project);
  workspace.restoreExerciseEditor();assert.equal(loads.length,2,'restoring twice is harmless');
});

test('leaving exercise screen while native audio boots cannot publish the old exercise',async()=>{
  const workspace=new Workspace(),abort=new AbortController();workspace.patch({view:'practice',practiceKind:'grade'});
  let release!:(b:EngineBridge)=>void;
  workspace.ensureEngine=()=>new Promise<EngineBridge>(resolve=>{release=resolve;});
  const pending=workspace.exerciseAudition(new Uint8Array([1]),abort.signal);
  await new Promise(resolve=>setTimeout(resolve,0));abort.abort();workspace.patch({view:'library'});
  release({api:{loadScoreData:()=>{throw Error('stale load');}}} as unknown as EngineBridge);
  await assert.rejects(pending,{name:'AbortError'});assert.equal(workspace.state.view,'library');
});

test('restart saves the aborted attempt without navigating away or replacing the active result',async()=>{
  const workspace=new Workspace(),t=timeline();workspace.patch({view:'practice'});
  workspace.navigate=()=>{throw Error('A restart must remain on the practice screen');};
  const result=resultFor(t,new PracticeEngine(t).view(),'Restart UI check','aborted',100);
  await workspace.recordResult(result,false,false);
  assert.equal(workspace.state.view,'practice');assert.equal(workspace.state.result,undefined);
  assert(workspace.state.history.some(r=>r.id===result.id));
  assert.equal((await storage.get<{outcome:string}>('sessions',result.id))?.outcome,'aborted');
});

test('retrying foreign-device history retains local calibration; device change resets it',async()=>{
  const workspace=new Workspace(),snapshot=scoreFixture();
  workspace.patch({snapshot,config:{...settingsFor(snapshot),offsetMs:35}});
  workspace.updatePracticeSettings({deviceId:'other-piano',inputSource:'midi',offsetMs:150,bpm:75});
  assert.equal(workspace.state.config!.deviceId,'virtual');assert.equal(workspace.state.config!.inputSource,'virtual');
  assert.equal(workspace.state.config!.offsetMs,35);assert.equal(workspace.state.config!.bpm,75);
  workspace.midi.deviceId='my-piano';workspace.updatePracticeSettings({deviceId:'my-piano',offsetMs:0});
  assert.equal(workspace.state.config!.offsetMs,0);assert.equal(workspace.state.config!.inputSource,'midi');
  workspace.updatePracticeSettings({offsetMs:60});
  assert.equal((await storage.get<{offsetMs:number}>('settings','calibration-v2:my-piano'))?.offsetMs,60);
  assert.equal((await storage.get<{config:{bpm:number}}>('settings','practice-v2:'+snapshot.projectId))?.config.bpm,75);
});

test('an unavailable native engine cannot overwrite recovery or accept further editor actions', async () => {
  const workspace = new Workspace();
  workspace.patch({engineFailed: true, revision: 5, recoveryRevision: 4});
  workspace.bridge = {serialize() {throw Error('Must not touch failed native memory');}} as unknown as EngineBridge;
  await workspace.autosave(true);
  await workspace.run(() => {throw Error('Must not run an action after a native failure');});
  await assert.rejects(workspace.ensureEngine(), /Tải lại trang/);
  assert.equal(workspace.state.recoveryRevision, 4);
});

test('file drop and project commands cannot replace the score of an active or paused practice session', async () => {
  const workspace = new Workspace();
  for (const status of ['counting', 'running', 'paused', 'interrupted'] as const) {
    workspace.session = {status} as PracticeController;
    await assert.rejects(workspace.importFile(new File(['bad'], 'new.musicxml')), /Kết thúc lượt/);
    await assert.rejects(workspace.newProject(), /Kết thúc lượt/);
    await assert.rejects(workspace.openProject('another-project'), /Kết thúc lượt/);
    await assert.rejects(workspace.saveAs('New identity'), /Kết thúc lượt/);
    await assert.rejects(workspace.rename('Another name'), /Kết thúc lượt/);
    await assert.rejects(workspace.openEditor(), /Kết thúc lượt/);
  }
});

test('Editor navbar opens a blank document on first use and reuses the open score afterward', async () => {
  const workspace = new Workspace(); let created = 0;
  workspace.newProject = async () => {
    created++;
    workspace.patch({current: {id: 'blank', title: 'Bản nhạc mới', filename: 'blank.mscz', bytes: new Uint8Array(), revision: 1, createdAt: 0, updatedAt: 0}});
    workspace.bridge = {} as EngineBridge;
  };
  workspace.navigate = view => {workspace.patch({view});};
  await workspace.openEditor(); await workspace.openEditor();
  assert.equal(created, 1); assert.equal(workspace.state.view, 'editor'); assert.equal(workspace.state.current?.id, 'blank');
});

test('Practice navbar is available before opening any score and does not load the engine', async () => {
  const workspace = new Workspace();
  workspace.ensureEngine = async () => {throw Error('Choosing a practice score must not require WASM');};
  workspace.navigate = view => {workspace.patch({view});};
  await workspace.practice();
  assert.equal(workspace.state.view, 'practice'); assert.equal(workspace.state.practicePicker, true);
  assert.equal(workspace.state.current, undefined); assert.equal(workspace.bridge, undefined);
});

test('reselecting the Practice navbar during a session preserves held input and its current screen', () => {
  const workspace = new Workspace();
  workspace.patch({view: 'practice', practicePicker: false});
  workspace.navigate = () => {throw Error('Navigating again would release MIDI keys');};
  for (const status of ['counting', 'running', 'paused', 'interrupted'] as const) {
    workspace.session = {status} as PracticeController;
    workspace.openPractice();
    assert.equal(workspace.state.practicePicker, false); assert.equal(workspace.session.status, status);
  }
});

test('overlapping document changes cannot publish different scores or hide the active busy state', async () => {
  const workspace = new Workspace(); let unblock!: () => void;
  workspace.autosave = () => new Promise<void>(resolve => {unblock = resolve;});
  const first = workspace.saveAs('copy');
  await assert.rejects(workspace.newProject(), /Đang xử lý/);
  await assert.rejects(workspace.openProject('other'), /Đang xử lý/);
  assert.ok(workspace.state.busy); unblock(); await first; assert.equal(workspace.state.busy, '');
  workspace.autosave = async () => {}; await workspace.saveAs('no project'); assert.equal(workspace.state.busy, '');
});
