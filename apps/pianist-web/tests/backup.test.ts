import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {zipSync, unzipSync, strToU8, strFromU8} from 'fflate';
import {encodeLibrary, decodeLibrary, restoredCopies} from '../src/platform/library-backup';
import * as storage from '../src/platform/storage';
import {timeline} from './helpers/fixtures-v2';
import {PracticeEngine} from '../../../packages/practice-engine-v2/engine';
import {resultFor} from '../../../packages/practice-engine-v2/results';

const score = zipSync({'score.mscx': strToU8('<museScore version="4.0"><Score/></museScore>')});
const source = strToU8('<score-partwise version="4.0"><part-list/></score-partwise>');
function library(): storage.LibraryData {
  const plan=timeline([0]),core=new PracticeEngine(plan);core.clock(1000);
  const result=resultFor(plan,core.view(),'History','complete',1000);
  result.replay={engine:plan.engine,commands:[{type:'clock',atMs:1000}]};
  return {projects: [{id: plan.projectId, title: 'Bài gốc', filename: 'score.mscz', bytes: score, source, sourceName: 'score.musicxml', revision: 1, updatedAt: 10, createdAt: 1, archived: true}],
    recovery: [{id: plan.projectId, title: 'Bài đang sửa', filename: 'recovery.mscz', bytes: score, revision: 2, updatedAt: 20}], sessions: [result], settings: [{id: 'calibration:piano', offsetMs: 80}]};
}
test('library backup round-trips original bytes, recovery, history/replay and settings', async () => {
  const data = library(), bytes = await encodeLibrary(data), backup = await decodeLibrary(bytes);
  assert.deepEqual(backup.data, data); assert.ok(backup.createdAt > 0);
  const copies = restoredCopies(backup);
  assert.notEqual(copies.projects[0].id, data.projects[0].id); assert.match(copies.projects[0].title, /khôi phục/);
  assert.equal(copies.recovery[0].id, copies.projects[0].id); assert.equal(copies.sessions[0].projectId, copies.projects[0].id);
  assert.equal(copies.sessions[0].schemaVersion===2 && copies.sessions[0].timeline.projectId, copies.projects[0].id);
  assert.equal(copies.sessions[0].fingerprint, data.sessions[0].fingerprint);
  assert.equal(copies.settings.some(s => s.id === 'calibration:piano'), false, 'foreign device calibration is retained as backup metadata, not activated');
  assert.equal(backup.data.projects[0].title, 'Bài gốc');
});
test('a long imported title can restore its own backup; historical records stay read-only data',async()=>{
  const data=library();data.projects[0].title='Bài piano '.repeat(25);data.projects[0].filename=data.projects[0].title+'.mscz';
  data.sessions.push({id:'archived-v1',schemaVersion:1,projectId:data.projects[0].id,title:'Bản cũ',createdAt:1,config:{algorithmVersion:'archived'},untouched:{value:17}});
  assert.deepEqual((await decodeLibrary(await encodeLibrary(data))).data,data);
});

test('R4 restores its report and rejects forged pedal matches before rendering',async()=>{
  const data=library();const saved=data.sessions[0];assert.equal(saved.schemaVersion,2);if(saved.schemaVersion!==2)return;
  assert(saved.r4);const good=await decodeLibrary(await encodeLibrary(data));assert.deepEqual(good.data.sessions[0],saved);
  saved.r4.pedal.matching=[[0,999]];
  await assert.rejects(decodeLibrary(await encodeLibrary(data)),/không hợp lệ/);
});
test('tampered content, malformed manifest, traversal and unknown archive files are rejected before any writes', async () => {
  const bytes = await encodeLibrary(library());
  const changed = unzipSync(bytes); changed['projects/0.mscz'] = score.slice(); changed['projects/0.mscz'][40] ^= 1;
  await assert.rejects(decodeLibrary(zipSync(changed)), /không hợp lệ/);
  const invalid = unzipSync(bytes), manifest = JSON.parse(strFromU8(invalid['manifest.json'])); manifest.version = 999;
  invalid['manifest.json'] = strToU8(JSON.stringify(manifest)); await assert.rejects(decodeLibrary(zipSync(invalid)), /không hợp lệ/);
  await assert.rejects(decodeLibrary(zipSync({'../manifest.json': strToU8('{}')})), /không hợp lệ/);
  await assert.rejects(decodeLibrary(zipSync({...unzipSync(bytes), 'extra.js': strToU8('bad')})), /không hợp lệ/);
});
test('restore is atomic on a duplicate-key failure and never overwrites existing scores', async () => {
  const data = library(); await storage.claimProject(data.projects[0].id); await storage.saveProject(data.projects[0]);
  const before = await storage.librarySnapshot(), copies = restoredCopies(await decodeLibrary(await encodeLibrary(data)));
  copies.projects.push(data.projects[0]);
  await assert.rejects(storage.restoreLibrary(copies)); assert.deepEqual(await storage.librarySnapshot(), before);
  copies.projects.pop(); await storage.restoreLibrary(copies);
  const after = await storage.librarySnapshot(); assert.equal(after.projects.length, before.projects.length + 1);
  assert.deepEqual(await storage.get('projects', data.projects[0].id), data.projects[0]);
  assert.equal(after.recovery[0].revision, 2); assert.equal(after.sessions[0].id, copies.sessions[0].id);
  await storage.releaseProject(data.projects[0].id);
});

test('backup v2 preserves selected ABC source metadata; v1 remains readable and forged tune/hash is rejected',async()=>{
  const data=library(),abc=strToU8('X:7\nT:Trùng\nK:C\nC4|\nX:7\nT:Trùng\nK:C\nD4|');
  Object.assign(data.projects[0],{source:abc,sourceName:'book.abc',sourceFormat:'abc',sourceTuneIndex:1,sourceTuneId:'7',sourceTuneTitle:'Trùng',
    sourceHash:Buffer.from(await crypto.subtle.digest('SHA-256',abc.slice().buffer)).toString('hex'),converterVersion:'abc2xml-2.68+xml2abc-1.77',importDiagnostics:[{level:'warning',code:'upstream',message:'layout'}]});
  const bytes=await encodeLibrary(data);assert.deepEqual((await decodeLibrary(bytes)).data,data);
  const copy=restoredCopies(await decodeLibrary(bytes));assert.deepEqual(copy.projects[0].source,abc);assert.equal(copy.projects[0].sourceTuneIndex,1);
  for(const patch of [{sourceTuneIndex:2},{sourceHash:'0'.repeat(64)},{sourceTuneId:'8'},{sourceFormat:3},{importDiagnostics:[{level:'warning',message:3}]}]) {
    const files=unzipSync(bytes),m=JSON.parse(strFromU8(files['manifest.json']));Object.assign(m.projects[0],patch);files['manifest.json']=strToU8(JSON.stringify(m));
    await assert.rejects(decodeLibrary(zipSync(files)),/không hợp lệ/);
  }
  const legacy=library(),old=unzipSync(await encodeLibrary(legacy)),m=JSON.parse(strFromU8(old['manifest.json']));m.version=1;old['manifest.json']=strToU8(JSON.stringify(m));assert.deepEqual((await decodeLibrary(zipSync(old))).data,legacy);
});

test('import batch is atomic on quota, duplicate key and cancellation; caps include source copies',async t=>{
  const before=await storage.list('projects'),p=library().projects[0];
  const first={...p,id:crypto.randomUUID()},second={...p,id:crypto.randomUUID()};
  await assert.rejects(storage.insertProjects([first,first]));assert.deepEqual(await storage.list('projects'),before);
  const original=IDBObjectStore.prototype.add;let adds=0;
  t.mock.method(IDBObjectStore.prototype,'add',function(this:IDBObjectStore,value:unknown,key?:IDBValidKey){if(++adds===2)throw new DOMException('Quota','QuotaExceededError');return original.call(this,value,key);});
  await assert.rejects(storage.insertProjects([first,second]),{name:'QuotaExceededError'});assert.deepEqual(await storage.list('projects'),before);t.mock.restoreAll();
  const abort=new AbortController();t.mock.method(IDBObjectStore.prototype,'add',function(this:IDBObjectStore,value:unknown,key?:IDBValidKey){const req=original.call(this,value,key);abort.abort();return req;});
  await assert.rejects(storage.insertProjects([first],abort.signal));assert.deepEqual(await storage.list('projects'),before);t.mock.restoreAll();
  await assert.rejects(storage.checkImportCapacity(storage.MAX_IMPORT_BATCH_BYTES+1),/128 MiB/);
});
