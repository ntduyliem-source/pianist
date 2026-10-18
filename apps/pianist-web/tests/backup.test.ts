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
