import test from 'node:test';
import assert from 'node:assert/strict';
import { PracticeController } from '../src/practice/controller-v2';
import { PracticeSessions } from '../src/application/session-lifecycle';
import { timeline } from './helpers/fixtures-v2';

for (const fault of ['crash', 'close-failure', 'close-throw', 'close-timeout'] as const) {
  test(`worker ${fault} preserves acknowledged results and releases the session`, async () => {
    const oldWorker = globalThis.Worker, oldWindow = globalThis.window;
    let worker: any, terminated = 0;
    const view = {judgements: [], extras: [], held: [], pedal: false, intervals: [], group: 0, done: false, processedMs: 0, faults: []};
    (globalThis as any).window = {setInterval, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms === 5000 ? 5 : ms)};
    (globalThis as any).Worker = class {
      onmessage: any; onerror: any; generation = '';
      constructor() { worker = this; }
      postMessage(data: any) {
        if (data.type === 'load') {
          this.generation = data.generation;
          queueMicrotask(() => this.onmessage({data: {type: 'ready', generation: data.generation, view}}));
        }
        if (data.type === 'close') {
          if (fault === 'close-throw') throw Error('Cannot post to dead worker');
          if (fault !== 'close-timeout') queueMicrotask(() => this.onmessage({data: {type: 'failure', generation: data.generation, message: 'Worker failed'}}));
        }
      }
      terminate() { terminated++; }
    };
    const sessions = new PracticeSessions(), c = sessions.install(new PracticeController(timeline(), 'failure'));
    const saved: any[] = [];
    c.onComplete = result => { saved.push(result); };
    c.transport.start = async () => {};
    (c.transport as any).context = {state: 'running', close: async () => {}};
    try {
      await c.start(() => []);
      c.view.judgements.push({id: c.timeline.targets[0].id, seq: 1, grade: 'perfect', delta: 0, atMs: 0} as any);
      if (fault === 'crash') worker.onerror({message: 'Worker crashed'});
      await c.finish();
      assert.equal(c.status, 'finished');
      assert.equal(sessions.active, false);
      assert.doesNotThrow(() => sessions.requireIdle());
      assert.equal(terminated, 1);
      assert.equal(saved.length, 1);
      assert.equal(saved[0].outcome, 'interrupted');
      assert.equal(saved[0].judgements.length, 1);
      assert.equal(saved[0].replay, undefined);
      assert.equal(saved[0].faults.length, 1);
      await c.finish();
      worker.onmessage({data: {type: 'closed', generation: worker.generation, view}});
      assert.equal(saved.length, 1, 'late replies/Stop cannot create a second result');
    } finally {
      sessions.dispose(c);
      (globalThis as any).Worker = oldWorker;
      (globalThis as any).window = oldWindow;
    }
  });
}

