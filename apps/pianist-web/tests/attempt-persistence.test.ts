import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { Workspace } from '../src/workspace';
import { AttemptPersistence, type PendingAttempt } from '../src/application/attempt-persistence';
import { timeline } from './helpers/fixtures-v2';
import { PracticeEngine } from '../../../packages/practice-engine-v2/engine';
import { resultFor } from '../../../packages/practice-engine-v2/results';
import * as storage from '../src/platform/storage';

function result() {
  const plan = timeline();
  plan.projectId = 'method:hanon-part-1:hanon-part-1-001';
  return resultFor(plan, new PracticeEngine(plan).view(), 'Hanon 01', 'complete', 1000);
}

test('a hidden method result survives quota and navigation, can export its JSON, and retries exactly once', async t => {
  const ws = new Workspace(), attempt = result();
  const put = IDBObjectStore.prototype.put;
  t.mock.method(IDBObjectStore.prototype, 'put', function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
    if (this.name === 'sessions') throw new DOMException('Quota', 'QuotaExceededError');
    return put.call(this, value, key);
  });
  await ws.recordResult(attempt, true, false);
  assert.equal(ws.state.result, undefined, 'do not navigate a hidden completion into Results');
  assert.equal(ws.state.pendingAttempts.length, 1);
  assert.match(ws.state.pendingAttempts[0].error, /đầy/);
  ws.patch({ view: 'library', practiceKind: 'free' });
  assert.deepEqual(JSON.parse(JSON.stringify(ws.state.pendingAttempts[0].result)), JSON.parse(JSON.stringify(attempt)));
  assert.equal(await storage.get('sessions', attempt.id), undefined);
  t.mock.restoreAll();
  await Promise.all([ws.retryPendingAttempt(attempt.id), ws.retryPendingAttempt(attempt.id)]);
  assert.equal(ws.state.pendingAttempts.length, 0);
  assert.equal(ws.state.view, 'library', 'retry must not steal navigation');
  assert.equal((await storage.list<{ id: string }>('sessions')).filter(r => r.id === attempt.id).length, 1);
  assert(ws.state.history.some(r => r.id === attempt.id));
});

test('failed attempts queue independently; retry stays visible and a persistence adapter cannot delete retained replay', async () => {
  let pending: PendingAttempt[] = [], writes = 0, unlock!: () => void;
  const a = result(), b = result();
  a.replay = { engine: a.engine, commands: [{ type: 'clock', atMs: 1 }] };
  const queue = new AttemptPersistence(async value => {
    delete value.replay;
    if (++writes <= 2) throw Error('write unavailable');
    await new Promise<void>(resolve => { unlock = resolve; });
  }, value => { pending = value; });
  assert.equal(await queue.save(a, false), false);
  assert.equal(await queue.save(b, false), false);
  assert(a.replay);
  assert.equal(pending.length, 2);
  const retry = queue.retry(a.id);
  assert.equal(queue.retry(a.id), retry);
  assert.equal(pending.find(p => p.result.id === a.id)!.saving, true);
  assert.equal(pending.find(p => p.result.id === a.id)!.error, 'write unavailable');
  await new Promise(resolve => setTimeout(resolve, 0));
  unlock();
  assert.equal(await retry, true);
  assert.deepEqual(pending.map(p => p.result.id), [b.id]);
});
