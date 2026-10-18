import test from 'node:test';
import assert from 'node:assert/strict';
import {EngineBridge, type NativeApi} from '../../../packages/engine-bridge/index';

test('R4 key releases and pedal instructions are part of the score fingerprint',async()=>{
  const Module:any={},raw:any={schemaVersion:1,revision:0,anchors:[],performed:[],occurrences:[],beats:[],durationReference:'musescore-midi',keyReleases:[],pedals:[]};
  const bridge=new EngineBridge({Module,getPracticeSnapshot(){Module.onPracticeSnapshot(JSON.stringify(raw));return 1;}} as NativeApi);
  const hash=async(value:unknown)=>JSON.stringify(value);
  const before=await bridge.cancellableSnapshot('p',hash);raw.pedals.push({id:0,atMs:0,endMs:1000});
  const pedal=await bridge.cancellableSnapshot('p',hash);assert.notEqual(before.fingerprint,pedal.fingerprint);
  raw.keyReleases.push({anchor:'a',endMs:400});assert.notEqual(pedal.fingerprint,(await bridge.cancellableSnapshot('p',hash)).fingerprint);
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
