import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { Workspace, workspace as uiWorkspace } from '../src/workspace';
import { projectTrack } from '../src/features/library/LibraryPlayback';
import * as storage from '../src/platform/storage';
import type { EngineBridge } from '../../../packages/engine-bridge';

test('linking a recovered bundled song cannot promote stale bytes; playback reads the editor recovery', async t => {
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setInterval: () => 0 } });
  t.after(() => priorWindow
    ? Object.defineProperty(globalThis, 'window', priorWindow)
    : Reflect.deleteProperty(globalThis, 'window'));
  const ws = new Workspace(), loaded: number[] = [];
  t.mock.method(ws, 'autosave', async () => {});
  t.mock.method(uiWorkspace, 'autosave', async () => {});
  t.mock.method(ws, 'notice', () => {});
  ws.navigate = view => ws.patch({ view });
  ws.bridge = {
    revision: 5, setPractice() {},
    api: { loadScoreData(bytes: Uint8Array) { loaded.push(bytes[0]); return true; } },
  } as unknown as EngineBridge;
  (ws as unknown as { measureDiagnostic(): void }).measureDiagnostic = () => {};
  const source = new Uint8Array([10, 20]);
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', source)).toString('hex');
  const project: storage.ProjectRecord = {
    id: crypto.randomUUID(), title: 'Recovery', filename: 'saved.mscz', bytes: new Uint8Array([1]),
    source, sourceName: 'Recovery.mxl', revision: 1, createdAt: 1, updatedAt: 10,
  };
  await storage.claimProject(project.id);
  t.after(() => storage.releaseProject(project.id));
  await storage.saveProject(project);
  const recovery: storage.RecoveryRecord = {
    id: project.id, title: 'Edited recovery', filename: 'recovery.mscz',
    bytes: new Uint8Array([2]), revision: 2, updatedAt: 20,
  };
  await storage.saveProject(recovery, true);
  await ws.refresh();
  t.mock.method(globalThis, 'fetch', async () => new Response(source));
  await ws.openBundledScore({ id: hash, sha256: hash, bytes: source.length,
    title: project.title, filename: project.sourceName!, url: 'library/songs/recovery.mxl' });
  assert.deepEqual(loaded, [2]);
  assert.equal(ws.state.current!.revision, 2);
  assert.deepEqual(ws.state.current!.bytes, recovery.bytes);
  const saved = (await storage.get<storage.ProjectRecord>('projects', project.id))!;
  assert.equal(saved.revision, 1, 'a metadata link must not mark recovery as manually saved');
  assert.deepEqual(saved.bytes, project.bytes);
  assert.equal(saved.sourceHash, hash);
  const normalized = new Uint8Array([11, 21]);
  const normalizedHash = Buffer.from(await crypto.subtle.digest('SHA-256', normalized)).toString('hex');
  t.mock.method(globalThis, 'fetch', async () => new Response(normalized));
  const importedId = crypto.randomUUID();
  t.mock.method(ws, 'importFile', async (file: File) => {
    const source = new Uint8Array(await file.arrayBuffer());
    assert.deepEqual(source, normalized, 'opening an updated edition must import its current bytes');
    const imported = { ...project, id: importedId, source, sourceName: file.name };
    await storage.claimProject(importedId);
    t.after(() => storage.releaseProject(importedId));
    await storage.saveProject(imported);
    ws.patch({ current: imported });
  });
  await ws.openBundledScore({ id: normalizedHash, sha256: normalizedHash, sourceHashes: [hash],
    workId: hash, version: 1, bytes: normalized.length, title: 'Tên chuẩn hóa',
    arranger: 'Người Soạn', filename: 'Tên chuẩn hóa.mxl', url: 'library/songs/recovery.mxl' });
  assert.deepEqual(loaded, [2], 'the old recovery is not silently loaded as the new source');
  assert.equal(ws.state.current!.id, importedId);
  assert.equal(ws.state.current!.title, 'Tên chuẩn hóa');
  assert.equal(ws.state.current!.sourceHash, normalizedHash);
  assert.equal(ws.state.current!.arranger, 'Người Soạn');
  assert.equal((await storage.get<storage.ProjectRecord>('projects', project.id))!.sourceHash, hash);
  assert.deepEqual(await storage.get<storage.RecoveryRecord>('recovery', project.id), recovery);
  assert.deepEqual((await storage.get<storage.ProjectRecord>('projects', project.id))!.bytes, project.bytes);
  assert.deepEqual(await projectTrack(saved, 'V1').load(new AbortController().signal), {
    bytes: recovery.bytes, filename: recovery.filename,
  });
  // Repair-read legacy records produced by the old metadata-link bug as well.
  const legacy = { ...saved, revision: recovery.revision };
  await storage.saveProject(legacy, false, false);
  assert.deepEqual(await projectTrack(legacy, 'V1').load(new AbortController().signal), {
    bytes: recovery.bytes, filename: recovery.filename,
  });
  // A card holding old metadata still consults the latest durable project.
  await storage.saveProject({ ...saved, bytes: new Uint8Array([3]), revision: 3, updatedAt: 30 });
  assert.deepEqual((await projectTrack(saved, 'V1').load(new AbortController().signal)).bytes,
    new Uint8Array([3]));
});
