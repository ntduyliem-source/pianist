import test from 'node:test';
import assert from 'node:assert/strict';
import {Workspace} from '../src/workspace';
import type {EngineBridge} from '../../../packages/engine-bridge/index';
import type {PracticeSession} from '../src/practice/session';

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
    workspace.session = {status} as PracticeSession;
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
    workspace.session = {status} as PracticeSession;
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
