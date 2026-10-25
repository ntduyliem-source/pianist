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

function navigationDom(t: {after: (cleanup: () => void) => void}) {
  const globals = {
    location: {hash: '/practice'},
    document: {
      body: {dataset: {}},
      getElementById: () => ({inert: false, setAttribute() {}, focus() {}}),
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {configurable: true, value});
    t.after(() => previous
      ? Object.defineProperty(globalThis, name, previous)
      : Reflect.deleteProperty(globalThis, name));
  }
}


function mockSession(workspace: Workspace, status: PracticeController['status'], dispose = () => {}) {
  if (workspace.session) { workspace.session.status = status; return; }
  workspace.sessions.install({ status, dispose, onChange: () => {} } as PracticeController);
}

test('old editor-only metadata no longer blocks the practice shortcut',async()=>{
  const workspace=new Workspace(),bytes=new TextEncoder().encode('native score with grace');
  const sha=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
  const score:BundledScore={id:sha,sha256:sha,bytes:bytes.length,title:'Version two',filename:'Version two.mxl',url:'library/songs/version-two.mxl',practiceReady:false,practiceNotice:'Chưa hỗ trợ tập nốt hoa mỹ.'};
  workspace.patch({bundledScores:[score],current:{id:'readmitted',title:score.title,filename:'two.mscz',sourceName:score.filename,source:bytes,bytes,revision:1,createdAt:0,updatedAt:0}});
  const snapshot=scoreFixture();snapshot.staves.push({id:1,part:'Piano',partId:'p'});
  let generated=false;
  workspace.autosave=async()=>{};
  (workspace as unknown as {measureDiagnostic:()=>void}).measureDiagnostic=()=>{};
  workspace.bridge={setPractice(){},async cancellableSnapshot(){generated=true;return snapshot;}} as unknown as EngineBridge;
  workspace.navigate=view=>workspace.patch({view});
  await workspace.practice();assert.equal(generated,true);assert.equal(workspace.state.view,'practice');
});

test('reselecting grade practice navbar never releases held MIDI during a running attempt',()=>{
  const workspace=new Workspace();workspace.patch({view:'practice',practiceKind:'grade'});mockSession(workspace, 'running');
  workspace.midi.release=()=>{throw Error('held input must survive');};
  assert.doesNotThrow(()=>workspace.navigate('practice'));assert.equal(workspace.state.view,'practice');
});

test('practice kind switches keep the editor project and open the matching selector',()=>{
  const workspace=new Workspace();let restored=0,disposed=0;
  const current={id:'free-song',title:'Library song',filename:'song.mscz',bytes:new Uint8Array([1]),revision:1,createdAt:0,updatedAt:0};
  workspace.patch({current,view:'practice',practicePicker:false});
  workspace.navigate=view=>workspace.patch({view});
  workspace.restoreExerciseEditor=()=>{restored++;};
  mockSession(workspace, 'finished', () => {disposed++;});
  workspace.selectPracticeKind('grade');
  assert.equal(workspace.state.practiceKind,'grade');assert.equal(workspace.state.practicePicker,true);
  assert.equal(workspace.state.current,current);assert.equal(disposed,1);assert.equal(restored,1);
  workspace.selectPracticeKind('free');
  assert.equal(workspace.state.practiceKind,'free');assert.equal(workspace.state.current,current);
});

test('changing practice kind cannot dispose a running or paused attempt',()=>{
  const workspace=new Workspace();workspace.patch({practiceKind:'grade'});
  for(const status of ['counting','running','paused','interrupted'] as const){
    mockSession(workspace, status, () => {throw Error('Must preserve attempt');});
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

test('method history resumes the exact lesson without opening a library project',async()=>{
  const workspace=new Workspace();
  workspace.navigate=(view)=>workspace.patch({view});
  workspace.openProject=async()=>{throw Error('A method lesson is not an IndexedDB song');};
  workspace.resumeMethod('method:hanon-part-1:hanon-part-1-002',{mode:'bpm',bpm:72,fromMeasure:3,toMeasure:4});
  assert.equal(workspace.state.practiceKind,'method');
  assert.equal(workspace.state.view,'practice');
  assert.equal(workspace.state.methodRequest?.lessonId,'hanon-part-1-002');
  assert.equal(workspace.state.methodRequest?.settings?.fromMeasure,3);
  assert.equal(workspace.state.projects.length,0);
  workspace.selectPracticeKind('free');
  assert.equal(workspace.state.methodRequest,undefined);
  assert.throws(()=>workspace.resumeMethod('method:../escape:bad'),/mã bài/);
  mockSession(workspace,'paused');
  assert.throws(()=>workspace.resumeMethod('method:hanon-part-1:hanon-part-1-001'),/Kết thúc lượt/);
});

test('method practice navbar preserves the method picker instead of the current editor score',async()=>{
  const workspace=new Workspace();workspace.patch({practiceKind:'method'});
  let opened=0;
  workspace.openPractice=()=>{opened++;};workspace.practice=async()=>{throw Error('Must keep method selector');};
  await workspace.enterPractice();assert.equal(opened,1);
});

test('leaving a pending method history request cancels it before returning through the practice navbar',async(t)=>{
  navigationDom(t);
  for (const destination of ['library','history'] as const) {
    const workspace = new Workspace();
    workspace.openProject = async () => {throw Error('A method request must not open a library project');};
    workspace.resumeMethod('method:hanon-part-1:hanon-part-1-002',{mode:'bpm',bpm:72});
    assert.equal(workspace.state.methodRequest?.lessonId,'hanon-part-1-002');
    assert.equal(workspace.state.view,'practice');
    // The method catalogue has not completed, so Methods has not consumed the intent.
    workspace.navigate(destination);
    assert.equal(workspace.state.view,destination);
    assert.equal(workspace.state.methodRequest,undefined);
    await workspace.enterPractice();
    assert.equal(workspace.state.view,'practice');
    assert.equal(workspace.state.practicePicker,true);
    assert.equal(workspace.state.methodRequest,undefined);
    // A deliberate new history click still carries the exact requested lesson.
    workspace.resumeMethod('method:hanon-part-1:hanon-part-1-003');
    assert.equal(workspace.snapshot().methodRequest?.lessonId,'hanon-part-1-003');
    workspace.openPractice();
    assert.equal(workspace.state.methodRequest,undefined);
  }
});

test('blocked navigation during a method attempt never cancels its pending intent or releases MIDI',t=>{
  navigationDom(t);
  for (const status of ['counting','running','paused','interrupted'] as const) {
    const workspace = new Workspace();
    workspace.notice = () => {};
    workspace.resumeMethod('method:hanon-part-1:hanon-part-1-002');
    const request = workspace.state.methodRequest;
    mockSession(workspace,status);
    workspace.midi.release = () => {throw Error('Do not release MIDI when navigation is rejected');};
    workspace.navigate('history');
    workspace.openPractice();
    assert.equal(workspace.state.view,'practice');
    assert.equal(workspace.state.methodRequest,request);
    assert.equal(workspace.session!.status,status);
    workspace.session!.status = 'finished';
    workspace.midi.release = () => {};
    workspace.navigate('history');
    assert.equal(workspace.state.methodRequest,undefined);
  }
});

test('grade and method audition retain the native editor and its undo history across multiple previews',async()=>{
  for (const kind of ['grade','method'] as const) {
  const workspace=new Workspace(),editor={undo:['edit'],redo:['redo']},exercise={undo:[],redo:[]};
  let active=editor,retained:typeof editor|undefined,restores=0,readOnly=false;
  const bridge={revision:7,get practiceActive(){return readOnly;},setPractice:(v:boolean)=>{readOnly=v;},audition:()=>{},auditionState:()=>({available:true}),
    serialize:()=>new Uint8Array([1,2,3]),api:{
      loadScoreData:()=>{throw Error('Do not replace the editor');},
      loadPracticeScore:()=>{assert.equal(readOnly,true);retained??=active;active=exercise;return 1;},
      restorePracticeScore:()=>{assert.equal(readOnly,true);active=retained!;retained=undefined;restores++;return 1;},
    }} as unknown as EngineBridge;
  workspace.bridge=bridge;
  const project={id:'borrow-test',title:'Editor',filename:'edit.mscz',bytes:new Uint8Array([1]),revision:2,createdAt:0,updatedAt:0};
  workspace.patch({view:'practice',practiceKind:kind,current:project,revision:2,recoveryRevision:2});
  await workspace.exerciseAudition(new Uint8Array([4]),new AbortController().signal);
  await workspace.exerciseAudition(new Uint8Array([5]),new AbortController().signal);
  assert.equal(active,exercise);assert.equal(workspace.state.current,project);assert.equal(workspace.state.projects.length,0);
  workspace.restoreExerciseEditor();assert.equal(active,editor);assert.deepEqual(active.undo,['edit']);assert.deepEqual(active.redo,['redo']);
  workspace.restoreExerciseEditor();assert.equal(restores,1);
  }
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

test('delayed result persistence never returns to Results after navigation or a new attempt', async () => {
  for (const replacement of [false, true]) {
    const workspace = new Workspace(), t = timeline();
    workspace.patch({view: 'practice'});
    mockSession(workspace, 'finished');
    const owner = workspace.session;
    const result = resultFor(t, new PracticeEngine(t).view(), 'Delayed complete', 'complete', 100);
    let release!: () => void;
    workspace.refresh = () => new Promise<void>(resolve => {release = resolve;});
    workspace.navigate = () => {throw Error('Stale result must not navigate');};
    const pending = workspace.recordResult(result, false, true, () => workspace.session === owner && workspace.state.view === 'practice');
    while (!release) await new Promise(resolve => setTimeout(resolve, 0));
    if (replacement) workspace.sessions.install({status: 'running', onChange() {}, dispose() {}} as PracticeController);
    else workspace.patch({view: 'library'});
    release(); await pending;
    assert.equal(workspace.state.result, undefined);
    assert.equal(workspace.state.view, replacement ? 'practice' : 'library');
    assert.equal((await storage.get<{outcome: string}>('sessions', result.id))?.outcome, 'complete');
  }
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
    mockSession(workspace, status);
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
    mockSession(workspace, status);
    workspace.openPractice();
    assert.equal(workspace.state.practicePicker, false); assert.equal(workspace.session!.status, status);
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
