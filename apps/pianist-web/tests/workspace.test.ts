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
  }
});
