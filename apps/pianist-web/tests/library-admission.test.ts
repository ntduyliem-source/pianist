import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { requireLibraryScore } from '../src/platform/library-admission';
import { pianoStaves } from './helpers/library-fixture';
import { Workspace } from '../src/workspace';
import type { EngineBridge } from '../../../packages/engine-bridge';
import * as storage from '../src/platform/storage';

test('library requires exactly two structural piano staves, independent of clefs and notes', () => {
  const staves = pianoStaves();
  assert.doesNotThrow(() => requireLibraryScore({ staves }));
  staves[1].partId = 'separate-piano';
  assert.doesNotThrow(() => requireLibraryScore({ staves }));
  for (const invalid of [[], staves.slice(0, 1), [...staves, { ...staves[0], id: 2 }]])
    assert.throws(() => requireLibraryScore({ staves: invalid }), /đúng 2 khuông/);
  staves[1].instruments!.push({
    tick: 1920,
    id: 'flute',
    soundId: 'wind.flutes.flute',
    programs: [73],
  });
  assert.throws(() => requireLibraryScore({ staves }), /nhạc cụ khác/);
  Reflect.deleteProperty(staves[1], 'instruments');
  assert.throws(() => requireLibraryScore({ staves }), /tải lại/);
});

test('saving and restoring reject invalid scores before any library mutation', async () => {
  const ws = new Workspace();
  const record: storage.ProjectRecord = {
    id: crypto.randomUUID(),
    title: 'Old one-staff',
    filename: 'one.mscz',
    bytes: Uint8Array.of(1),
    revision: 1,
    createdAt: 0,
    updatedAt: 0,
  };
  ws.patch({ current: record });
  ws.autosave = async () => {};
  const bridge = {
    semantics: () => ({ staves: pianoStaves().slice(0, 1) }),
    serialize: () => {
      throw Error('Must not serialize');
    },
  } as unknown as EngineBridge;
  ws.bridge = bridge;
  ws.ensureEngine = async () => bridge;
  const before = (await storage.list('projects')).length;
  await assert.rejects(ws.saveLibrary(), /đúng 2 khuông/);
  await assert.rejects(ws.saveAs('copy'), /đúng 2 khuông/);
  await assert.rejects(
    ws.restoreLibrary({ projects: [record], recovery: [], sessions: [], settings: [] }),
    /Chưa nhập/,
  );
  assert.equal((await storage.list('projects')).length, before);
  assert.equal(ws.state.current, record);
});

test('unarchive checks the stored revision, not stale card data, and releases its lease on rejection', async () => {
  const ws = new Workspace();
  const record: storage.ProjectRecord = {
    id: crypto.randomUUID(),
    title: 'Archived',
    filename: 'one.mscz',
    bytes: Uint8Array.of(2),
    revision: 2,
    createdAt: 0,
    updatedAt: 0,
    archived: true,
  };
  await storage.claimProject(record.id);
  await storage.saveProject(record, false, false);
  await storage.releaseProject(record.id);
  const bridge = {
    semantics: (bytes: Uint8Array) => {
      assert.equal(bytes[0], 2);
      return { staves: pianoStaves().slice(0, 1) };
    },
  } as unknown as EngineBridge;
  ws.ensureEngine = async () => bridge;
  await assert.rejects(
    ws.archive({ ...record, archived: false, bytes: Uint8Array.of(1), revision: 1 }),
    /đúng 2 khuông/,
  );
  assert.equal((await storage.get<storage.ProjectRecord>('projects', record.id))!.archived, true);
  const lease = await storage.get<{ owner?: string }>('leases', record.id);
  assert.equal(lease, undefined);
});
