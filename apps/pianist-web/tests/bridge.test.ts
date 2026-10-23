import test from 'node:test';
import assert from 'node:assert/strict';
import {EngineBridge, type NativeApi} from '../../../packages/engine-bridge/index';

test('native releases, pedal, tempo and unsupported grading techniques are part of the score fingerprint',async()=>{
  const Module:any={},raw:any={schemaVersion:1,revision:0,anchors:[],performed:[],occurrences:[],beats:[],durationReference:'musescore-midi',keyReleases:[],pedals:[]};
  const bridge=new EngineBridge({Module,getPracticeSnapshot(){Module.onPracticeSnapshot(JSON.stringify(raw));return 1;}} as NativeApi);
  const hash=async(value:unknown)=>JSON.stringify(value);
  const before=await bridge.cancellableSnapshot('p',hash);raw.pedals.push({id:0,atMs:0,endMs:1000});
  const pedal=await bridge.cancellableSnapshot('p',hash);assert.notEqual(before.fingerprint,pedal.fingerprint);
  raw.keyReleases.push({anchor:'a',endMs:400});assert.notEqual(pedal.fingerprint,(await bridge.cancellableSnapshot('p',hash)).fingerprint);
  const released=await bridge.cancellableSnapshot('p',hash);raw.tempos=[{occurrence:0,atMs:0,quarterBpm:100}];
  const tempo=await bridge.cancellableSnapshot('p',hash);assert.notEqual(released.fingerprint,tempo.fingerprint);
  raw.unsupported=[{kind:'arpeggio',measure:0}];assert.notEqual(tempo.fingerprint,(await bridge.cancellableSnapshot('p',hash)).fingerprint);
});

test('cancel and revision changes discard an asynchronous snapshot before it enters practice', async () => {
  const Module: any = {};
  const api = {Module, getPracticeSnapshot() {Module.onPracticeSnapshot(JSON.stringify({schemaVersion: 1, revision: 3, anchors: [], performed: [], occurrences: [], beats: []})); return 1;}} as NativeApi;
  const bridge = new EngineBridge(api); bridge.revision = 3;
  let resolve!: (hash: string) => void;
  const hash = () => new Promise<string>(r => {resolve = r;});
  const cancelled = bridge.cancellableSnapshot('p', hash); bridge.cancel(); resolve('hash');
  await assert.rejects(cancelled, /hủy snapshot/);
  const stale = bridge.cancellableSnapshot('p', hash); bridge.revision = 4; resolve('hash');
  await assert.rejects(stale, /hủy snapshot/);
  assert.equal(Module.onPracticeSnapshot, undefined);
});
test('serialized bytes are copied before native memory can change', () => {
  const Module: any = {}, bytes = new Uint8Array([1, 2, 3]);
  const api = {Module, serializeProject() {Module.onProjectSerialized(bytes); return 1;}} as NativeApi;
  const saved = new EngineBridge(api).serialize(); bytes[0] = 255;
  assert.deepEqual([...saved], [1, 2, 3]); assert.equal(Module.onProjectSerialized, undefined);
});

test('temporary projects and XML capture copy native memory and restore callbacks on success/failure',()=>{
  const old=()=>{},Module:any={onXmlExported:old,onProjectPrepared:old},bytes=Uint8Array.of(1,2);
  const api={Module,prepareProject(){Module.onProjectPrepared(bytes);return 1;},exportScore(){Module.onXmlExported(bytes);return 1;}} as unknown as NativeApi;
  const bridge=new EngineBridge(api),prepared=bridge.prepare(bytes,'a.musicxml'),xml=bridge.musicXml();bytes[0]=9;
  assert.deepEqual([...prepared],[1,2]);assert.deepEqual([...xml],[1,2]);assert.equal(Module.onXmlExported,old);assert.equal(Module.onProjectPrepared,old);
  api.exportScore=()=>{throw Error('export failed');};assert.throws(()=>bridge.musicXml(),/export failed/);assert.equal(Module.onXmlExported,old);
  api.prepareProject=()=>0;assert.throws(()=>bridge.prepare(bytes,'bad.musicxml'));assert.equal(Module.onProjectPrepared,old);
});

test('temporary snapshot does not reset active audition or publish an editor change; callbacks survive errors', () => {
  const previous = () => {}, Module: any = {onPreparedSnapshot: previous};
  const raw = {schemaVersion: 1, revision: 7, pages: [{svg: '<svg/>'}], anchors: [], performed: []};
  const api = {Module, preparePracticeSnapshot() {Module.onPreparedSnapshot(JSON.stringify(raw)); return 1;},
    practicePlayback() {throw Error('Must not interrupt current audition');},
    loadScoreData() {throw Error('Must not replace the editor');}} as unknown as NativeApi;
  const bridge = new EngineBridge(api); bridge.revision = 7; bridge.practiceActive = true;
  const snapshot = bridge.preparedSnapshot(Uint8Array.of(1), 'next.mxl');
  assert.deepEqual(snapshot, raw); assert.equal(Module.onPreparedSnapshot, previous);
  assert.equal(bridge.revision, 7); assert.equal(bridge.practiceActive, true);
  raw.pages[0].svg = 'changed'; assert.equal(snapshot.pages[0].svg, '<svg/>');
  raw.revision = 8;
  assert.throws(() => bridge.preparedSnapshot(Uint8Array.of(1), 'stale.mxl'), /không hợp lệ/);
  assert.equal(Module.onPreparedSnapshot, previous);
  for (const json of ['null', '{}', '{bad JSON']) {
    let nativeReturned = false;
    api.preparePracticeSnapshot = () => {Module.onPreparedSnapshot(json); nativeReturned = true; return 1;};
    assert.throws(() => bridge.preparedSnapshot(Uint8Array.of(1), 'bad-result.mxl'));
    assert.equal(nativeReturned, true, 'validation happens after native project cleanup');
    assert.equal(Module.onPreparedSnapshot, previous);
  }
  api.preparePracticeSnapshot = () => {throw Error('native failed');};
  assert.throws(() => bridge.preparedSnapshot(Uint8Array.of(1), 'bad.mxl'), /native failed/);
  assert.equal(Module.onPreparedSnapshot, previous);
  delete api.preparePracticeSnapshot;
  assert.throws(() => bridge.preparedSnapshot(Uint8Array.of(1), 'old-engine.mxl'), /MuseScore/);
  assert.equal(Module.onPreparedSnapshot, previous);
});
