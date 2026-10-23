import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionLifecycle, PracticeSessions, type SessionHandle } from '../src/application/session-lifecycle';
import { timeline } from './helpers/fixtures-v2';
import type { AttemptResult } from '../../../packages/practice-engine-v2/model';
import type { PracticeController } from '../src/practice/controller-v2';

const session = (dispose = () => {}): SessionHandle => ({ status: 'ready', onChange: () => {}, dispose });

test('session frames do not notify navigation subscribers; status transitions do', () => {
  const sessions = new SessionLifecycle<SessionHandle>();
  let frames = 0, statuses = 0;
  sessions.subscribe(() => { frames++; });
  sessions.subscribeStatus(() => { statuses++; });
  const current = sessions.install(session());
  assert.equal(statuses, 1);
  current.onChange(); current.onChange();
  assert.equal(frames, 3); assert.equal(statuses, 1);
  current.status = 'running'; current.onChange();
  assert.equal(statuses, 2); assert.equal(sessions.active, true);
  assert.throws(() => sessions.install(session()), /Kết thúc/);
});

test('stale callback and unmount cannot remove a replacement session', () => {
  const sessions = new SessionLifecycle<SessionHandle>();
  let oldDisposed = 0, nextDisposed = 0;
  const old = sessions.install(session(() => { oldDisposed++; })), stale = old.onChange;
  const next = sessions.install(session(() => { nextDisposed++; }));
  const revision = sessions.snapshot();
  stale(); assert.equal(sessions.snapshot(), revision);
  assert.equal(sessions.dispose(old), false);
  assert.equal(sessions.current, next); assert.equal(oldDisposed, 1); assert.equal(nextDisposed, 0);
});

test('ownership is cleared before disposal; synchronous cleanup cannot erase a replacement', () => {
  const sessions = new SessionLifecycle<SessionHandle>();
  const next = session(); let callback!: () => void;
  const old = sessions.install(session(() => { callback(); sessions.install(next); }));
  callback = old.onChange;
  sessions.dispose(old);
  assert.equal(sessions.current, next);
  assert.equal(sessions.statusSnapshot(), 'ready');
});

test('throwing cleanup still removes ownership and publishes idle', () => {
  const sessions = new SessionLifecycle<SessionHandle>();
  const old = sessions.install(session(() => { throw Error('cleanup failed'); }));
  assert.throws(() => sessions.dispose(old), /cleanup failed/);
  assert.equal(sessions.current, undefined); assert.equal(sessions.statusSnapshot(), 'idle');
});

test('application owns controller creation and rejects stale completion callbacks', () => {
  const sessions = new PracticeSessions(); let results = 0;
  const make = () => sessions.create({ timeline: timeline(), title: 'test', nativeAudio: async () => { throw Error('unused audio provider'); }, onComplete: () => { results++; } });
  const old = make(), oldComplete = old.onComplete;
  old.dispose = () => {};
  const next = make(); next.dispose = () => {};
  oldComplete({} as AttemptResult); assert.equal(results, 0);
  next.onComplete({} as AttemptResult); assert.equal(results, 1);
  sessions.setCompletion(old, () => { throw Error('stale replacement'); });
  old.onComplete({} as AttemptResult); assert.equal(results, 1);
});

test('failed startup that self-disposes still publishes idle; delayed failure cannot dispose its replacement', async () => {
  const sessions = new PracticeSessions();
  let release!: () => void, fail!: (error: Error) => void;
  const fake = (delayed: boolean) => {
    const controller = {
      status: 'ready', onChange() {}, dispose() {controller.status = 'finished';},
      async start() {
        controller.status = 'interrupted'; controller.onChange();
        if (delayed) await new Promise<void>((resolve, reject) => {release = resolve; fail = reject;});
        controller.dispose(); throw Error('audio failed');
      },
    } as unknown as PracticeController;
    return controller;
  };
  const first = sessions.install(fake(false));
  await assert.rejects(sessions.start(first, () => []), /audio failed/);
  assert.equal(sessions.current, undefined); assert.equal(sessions.statusSnapshot(), 'idle');
  const old = sessions.install(fake(true)), pending = sessions.start(old, () => []);
  sessions.dispose(old);
  const next = sessions.install(fake(false));
  fail(Error('old delayed failure'));
  await assert.rejects(pending, /old delayed failure/);
  assert.equal(sessions.current, next); assert.equal(next.status, 'ready');
  assert.equal(sessions.statusSnapshot(), 'ready');
});
