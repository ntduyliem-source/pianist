import test from 'node:test';
import assert from 'node:assert/strict';

test('public package imports do not access browser globals or install worker handlers', async () => {
  const names = ['Worker', 'window', 'self', 'location'] as const;
  const previous = new Map(
    names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  const handler = Object.getOwnPropertyDescriptor(globalThis, 'onmessage');
  try {
    for (const name of names)
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get() {
          throw Error('Import touched browser global: ' + name);
        },
      });
    const practice = await import('../../../packages/practice-engine-v2');
    const workers = await import('../../../packages/practice-worker-v2');
    const formats = await import('../../../packages/score-formats');
    assert.equal(typeof practice.createTimeline, 'function');
    assert.equal(typeof workers.createPracticeWorker, 'function');
    assert.equal(typeof formats.prepareImport, 'function');
    const client = new formats.ScoreFormatClient();
    client.dispose();
    assert.equal('ManiaKernel' in practice, false);
    assert.equal('ManiaHitWindows' in practice, false);
    assert.equal('offsetTolerance' in practice, false);
    assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'onmessage'), handler);
  } finally {
    for (const name of names) {
      const descriptor = previous.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

test('public worker factories construct only their own module worker when called', async () => {
  const { createPracticeWorker } = await import('../../../packages/practice-worker-v2');
  const { createScoreFormatWorker, ScoreFormatClient } = await import(
    '../../../packages/score-formats'
  );
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  const calls: { url: URL; options: WorkerOptions }[] = [];
  class WorkerFake {
    onmessage = null;
    onerror = null;
    constructor(url: URL, options: WorkerOptions) {
      calls.push({ url, options });
    }
    postMessage() {}
    terminate() {}
  }
  try {
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: WorkerFake });
    const client = new ScoreFormatClient();
    assert.equal(calls.length, 0, 'creating a client must not boot conversion');
    assert(createPracticeWorker() instanceof WorkerFake);
    assert(createScoreFormatWorker() instanceof WorkerFake);
    assert.deepEqual(
      calls.map((call) => call.options),
      [{ type: 'module' }, { type: 'module' }],
    );
    assert.match(calls[0].url.pathname, /\/packages\/practice-worker-v2\/worker\.ts$/);
    assert.match(calls[1].url.pathname, /\/packages\/score-formats\/worker\.ts$/);
    client.dispose();
    assert.equal(calls.length, 2);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'Worker', previous);
    else Reflect.deleteProperty(globalThis, 'Worker');
  }
});

test('public timing display uses the exact source-derived grading windows', async () => {
  const { hitWindows } = await import('../../../packages/practice-engine-v2');
  const { ManiaHitWindows } = await import('../../../packages/practice-engine-v2/upstream/mania');
  for (const difficulty of [0, 0.5, 5, 5.75, 10])
    assert.deepEqual(hitWindows(difficulty), new ManiaHitWindows(difficulty).values);
  for (const invalid of [-1, 11, NaN, Infinity])
    assert.throws(() => hitWindows(invalid), /Invalid osu!mania difficulty/);
});
