import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {zipSync, strToU8} from 'fflate';
import {validateFile} from '../src/platform/files';
import {MidiRouter} from '../src/platform/midi';
import {PracticeTransport} from '../src/platform/transport';
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
});
test('Web MIDI normalizes velocity-zero, duplicate Note On and sustain without inventing attacks', () => {
  const midi = new MidiRouter(), events: any[] = []; midi.onInput = e => events.push(e);
  const now = performance.now();
  midi.receive([0x92, 60, 70], now); midi.receive([0x92, 60, 70], now + 1); midi.receive([0x92, 60, 0], now + 2);
  assert.deepEqual(events.map(e => e.type), ['on', 'off']); assert.equal(events[0].channel, 2);
  midi.receive([0xb2, 64, 127], now + 3); assert.equal(midi.pedal, true); assert.deepEqual(midi.heldPitches(), []);
  midi.receive([0xb2, 64, 0], now + 4); assert.equal(midi.pedal, false);
  midi.receive([0x90, 62, 80], now + 5); midi.release(); assert.deepEqual(midi.heldPitches(), []);
});
test('MIDI retains normalized original timestamp, independent of callback receipt time', () => {
  const midi = new MidiRouter(); let recorded: any; midi.onInput = e => recorded = e;
  const timestamp = performance.now() - 80; midi.receive([0x90, 60, 90], timestamp + performance.timeOrigin);
  assert.ok(Math.abs(recorded.atMs - timestamp) < .01); assert.ok(recorded.receivedMs - recorded.atMs >= 79);
});
test('Audio output timestamp conversion uses the performance/context pair without double latency', () => {
  const transport = new PracticeTransport(); transport.context = {currentTime: 3, baseLatency: .01, outputLatency: .1,
    getOutputTimestamp: () => ({contextTime: 2, performanceTime: performance.now()})} as any;
  const now = performance.now(); assert.ok(Math.abs(transport.relative(now) - 2000) < 5);
  assert.equal(transport.source, 'AudioContext.getOutputTimestamp');
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
