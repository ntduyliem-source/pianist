import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {zipSync, strToU8} from 'fflate';
import {validateFile} from '../src/platform/files';
import {MidiRouter} from '../src/platform/midi-v2';
import {checkedAsset} from '../src/platform/engine-assets';
import * as storage from '../src/platform/storage';

test('ZIP preflight accepts MXL but rejects empty, traversal and actual expansion bombs', async () => {
  const xml = strToU8('<score-partwise version="4.0"></score-partwise>');
  await validateFile(zipSync({'score.musicxml': xml}), 'test.mxl');
  await assert.rejects(() => validateFile(new Uint8Array(), 'a.mxl'));
  await assert.rejects(() => validateFile(zipSync({'../evil.xml': xml}), 'test.mxl'), /không an toàn/);
  const bomb = zipSync({'large.xml': new Uint8Array(65 * 1024 * 1024)});
  await assert.rejects(() => validateFile(bomb, 'bomb.mxl'), /64 MiB|quá lớn/);
});
test('XML preflight rejects internal entities and unrelated file formats', async () => {
  await assert.rejects(() => validateFile(strToU8('<!DOCTYPE score [<!ENTITY x "y">]><score-partwise/>'), 'bad.musicxml'), /entity/);
  await assert.rejects(() => validateFile(strToU8('<html/>'), 'x.musicxml'), /bản nhạc/);
  await assert.rejects(() => validateFile(strToU8('<score-partwise/>'), 'x.exe'));
  await validateFile(strToU8('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd"><score-partwise/>'), 'valid.musicxml');
  await assert.rejects(() => validateFile(zipSync({'score.musicxml': strToU8('<!DOCTYPE score [<!ENTITY x "y">]><score-partwise/>')}), 'bad.mxl'), /entity/);
});
test('engine loader verifies both length and digest before executing a release asset', async () => {
  const bytes = new TextEncoder().encode('complete engine');
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
  const release = {version: 'v', files: [{path: 'engine.wasm', bytes: bytes.length, sha256}]};
  assert.deepEqual(await checkedAsset('engine.wasm', release, (async () => new Response(bytes)) as typeof fetch), bytes);
  await assert.rejects(() => checkedAsset('engine.wasm', release, (async () => new Response('partial engine')) as typeof fetch), /cập nhật/);
});
test('Web MIDI normalizes velocity-zero, duplicate Note On and sustain without inventing attacks', () => {
  const midi = new MidiRouter(), events: any[] = []; midi.onInput = e => events.push(e);
  const now = performance.now();
  midi.receive([0x92, 60, 70], now); midi.receive([0x92, 60, 70], now + 1); midi.receive([0x92, 60, 0], now + 2);
  assert.deepEqual(events.map(e => e.kind), ['on', 'off']); assert.equal(events[0].channel, 2);
  midi.receive([0xb2, 64, 127], now + 3); assert.equal(midi.pedal, true); assert.deepEqual(midi.heldPitches(), []);
  midi.receive([0xb2, 64, 0], now + 4); assert.equal(midi.pedal, false);
  midi.receive([0x90, 62, 80], now + 5); midi.release(); assert.deepEqual(midi.heldPitches(), []);
});
test('MIDI retains normalized original timestamp, independent of callback receipt time', () => {
  const midi = new MidiRouter(); let recorded: any; midi.onInput = e => recorded = e;
  const timestamp = performance.now() - 80; midi.receive([0x90, 60, 90], timestamp + performance.timeOrigin);
  assert.ok(Math.abs(recorded.timestampMs - timestamp) < .01); assert.ok(recorded.receivedMs - recorded.timestampMs >= 79);
});
test('physical MIDI keys held across start/blur must be released before another attack is accepted', () => {
  const midi = new MidiRouter(), events: any[] = []; midi.deviceId = 'piano'; midi.onInput = e => events.push(e);
  const send = (status: number, pitch = 60, velocity = 80) => midi.receive([status, pitch, velocity], performance.now(), 'piano', 'midi');
  send(0x90); midi.release(); send(0x90); assert.deepEqual(midi.heldPitches(), [60]);
  assert.deepEqual(events.map(e => e.kind), ['on', 'off']); send(0x80); send(0x90);
  assert.deepEqual(midi.heldPitches(), [60]); assert.equal(events.filter(e => e.kind === 'on').length, 2);
  midi.virtual(67, true); assert.deepEqual(midi.heldPitches(), [60], 'virtual keyboard cannot contaminate a MIDI session');
  midi.receive([0x90, 70, 80], performance.now(), 'other-piano', 'midi'); assert.deepEqual(midi.heldPitches(), [60]);
});
test('pedal is tracked per MIDI channel and release emits CC64 off even without held notes', () => {
  const midi = new MidiRouter(), events: any[] = []; midi.onInput = e => events.push(e);
  midi.receive([0xb0, 64, 127], performance.now()); midi.receive([0xb1, 64, 127], performance.now());
  midi.receive([0xb0, 64, 0], performance.now()); assert.equal(midi.pedal, true);
  midi.release(); assert.equal(midi.pedal, false);
  assert.equal(events.at(-1).channel, 1); assert.equal(events.at(-1).kind, 'pedal'); assert.equal(events.at(-1).value, 0);
});
test('malformed MIDI bytes and non-finite timestamps never enter held state', () => {
  const midi = new MidiRouter(); midi.receive([0x90, NaN, 80], performance.now()); midi.receive([0x90, 60, 80], NaN);
  midi.receive([0x90, 60.5, 80], performance.now()); assert.deepEqual(midi.heldPitches(), []);
});
test('MIDI permission denial, disconnect and reconnect keep the selected input state consistent', async () => {
  const navDescriptor = Object.getOwnPropertyDescriptor(navigator, 'requestMIDIAccess');
  const secureDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext');
  Object.defineProperty(globalThis, 'isSecureContext', {value: true, configurable: true});
  try {
    Object.defineProperty(navigator, 'requestMIDIAccess', {value: async () => {throw Error('denied');}, configurable: true});
    const denied = new MidiRouter(); await assert.rejects(() => denied.connect(), /cấp quyền/); assert.equal(denied.deviceId, 'virtual');
    const port = {id: 'piano', name: 'Test piano', state: 'connected', onmidimessage: null as any, async open() {}, async close() {}};
    const access = {inputs: new Map([['piano', port]]), onstatechange: () => {}};
    Object.defineProperty(navigator, 'requestMIDIAccess', {value: async (options: any) => {assert.equal(options.sysex, false); return access;}, configurable: true});
    const midi = new MidiRouter(); let disconnects = 0; midi.onDisconnect = () => ++disconnects;
    await midi.connect(); assert.equal(midi.deviceId, 'piano');
    port.onmidimessage({data: new Uint8Array([0x90, 60, 80]), timeStamp: performance.now()}); assert.deepEqual(midi.heldPitches(), [60]);
    port.state = 'disconnected'; access.onstatechange(); assert.equal(disconnects, 1); assert.equal(midi.deviceId, 'virtual'); assert.deepEqual(midi.heldPitches(), []);
    port.state = 'connected'; await midi.connect(false); assert.equal(midi.deviceId, 'virtual');
    await midi.select('piano'); assert.equal(midi.deviceId, 'piano'); assert.equal(disconnects, 1);
  } finally {
    if (navDescriptor) Object.defineProperty(navigator, 'requestMIDIAccess', navDescriptor); else Reflect.deleteProperty(navigator, 'requestMIDIAccess');
    if (secureDescriptor) Object.defineProperty(globalThis, 'isSecureContext', secureDescriptor); else Reflect.deleteProperty(globalThis, 'isSecureContext');
  }
});
test('All Notes Off releases only its MIDI channel and is distinguished from a disconnected port', () => {
  const midi = new MidiRouter(); let resets = 0, disconnected = 0; midi.onReset = () => ++resets; midi.onDisconnect = () => ++disconnected;
  midi.receive([0x90, 60, 80], performance.now()); midi.receive([0x91, 62, 80], performance.now());
  midi.receive([0xb0, 123, 0], performance.now());
  assert.deepEqual(midi.heldPitches(), [62]); assert.equal(resets, 1); assert.equal(disconnected, 0);
});
test('IndexedDB migration, recovery commit, explicit save and cross-tab lease conflict', async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('pianist-library', 1);
    req.onupgradeneeded = () => {req.result.createObjectStore('projects', {keyPath: 'id'}); req.result.createObjectStore('recovery', {keyPath: 'id'});};
    req.onerror = () => reject(req.error); req.onsuccess = () => {req.result.close(); resolve();};
  });
  const db = await storage.openDatabase(); assert.equal(db.version, 2); assert.ok(db.objectStoreNames.contains('sessions'));
  const project: storage.ProjectRecord = {id: 'project-1', title: 'Title', filename: 'title.mscz', bytes: new Uint8Array([1, 2, 3]), revision: 1, createdAt: 1, updatedAt: 1};
  await storage.claimProject(project.id); await storage.saveProject(project);
  await storage.saveProject({...project, revision: 2, bytes: new Uint8Array([4, 5])}, true);
  assert.equal((await storage.get<storage.ProjectRecord>('projects', project.id))?.revision, 1);
  assert.equal((await storage.get<storage.RecoveryRecord>('recovery', project.id))?.revision, 2);
  await storage.saveProject({...project, archived: true}, false, false);
  assert.equal((await storage.get<storage.RecoveryRecord>('recovery', project.id))?.revision, 2, 'archive must preserve recovery');
  await storage.saveProject({...project, revision: 2}); assert.equal(await storage.get('recovery', project.id), undefined);
  const otherModule = new URL('../src/platform/storage.ts', import.meta.url); otherModule.search = '?other-tab';
  const other = await import(otherModule.href);
  await assert.rejects(() => other.claimProject(project.id), /tab khác/);
  // Exercise the lease fallback as used in browsers without Web Locks.
  const lockDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
  Object.defineProperty(navigator, 'locks', {value: undefined, configurable: true});
  await storage.put('leases', {id: project.id, owner: 'other-tab', expires: Date.now() + 60000});
  await assert.rejects(() => storage.claimProject(project.id), /tab khác/);
  await assert.rejects(() => storage.saveProject({...project, revision: 99}), /Quyền ghi/);
  assert.equal((await storage.get<storage.ProjectRecord>('projects', project.id))?.revision, 2, 'failed save must not overwrite committed revision');
  await storage.put('leases', {id: project.id, owner: 'expired-tab', expires: Date.now() - 1});
  await storage.claimProject(project.id); await storage.saveProject({...project, revision: 3});
  assert.equal((await storage.get<storage.ProjectRecord>('projects', project.id))?.revision, 3);
  if (lockDescriptor) Object.defineProperty(navigator, 'locks', lockDescriptor); else Reflect.deleteProperty(navigator, 'locks');
  await storage.releaseProject(project.id);
  assert.match(storage.storageError(new DOMException('', 'QuotaExceededError')), /Chưa lưu được/);
});
test('an aborted save rolls back both project bytes and recovery deletion', async () => {
  const record: storage.ProjectRecord = {id: 'atomic-save', title: 'Test', filename: 'test.mscz', bytes: new Uint8Array([1]), revision: 1, createdAt: 1, updatedAt: 1};
  await storage.claimProject(record.id); await storage.saveProject(record);
  await storage.saveProject({...record, bytes: new Uint8Array([2]), revision: 2}, true);
  const db = await storage.openDatabase(), transaction = db.transaction.bind(db);
  (db as any).transaction = (names: string[], mode: IDBTransactionMode) => {
    const tx = transaction(names, mode);
    if (mode === 'readwrite' && names.includes('projects')) {
      const store = tx.objectStore('projects'), put = store.put.bind(store);
      store.put = ((value: any) => {const request = put(value); request.addEventListener('success', () => tx.abort()); return request;}) as typeof store.put;
    }
    return tx;
  };
  try {await assert.rejects(() => storage.saveProject({...record, revision: 3, bytes: new Uint8Array([3])}));}
  finally {db.transaction = transaction;}
  assert.deepEqual([...(await storage.get<storage.ProjectRecord>('projects', record.id))!.bytes], [1]);
  assert.equal((await storage.get<storage.RecoveryRecord>('recovery', record.id))?.revision, 2);
  await storage.releaseProject(record.id);
});
