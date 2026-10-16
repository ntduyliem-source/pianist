import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PracticeSession} from '../src/practice/session';
import {buildPlan, defaultConfig} from '../../../packages/practice-core/plan';
import type {ScoreSnapshot} from '../../../packages/score-contracts/index';

const score = JSON.parse(readFileSync(new URL('../../../tests/fixtures/pianist/practice/engine-snapshot.json', import.meta.url), 'utf8')) as ScoreSnapshot;
class AudioStub {
  currentTime = 1; state = 'running'; baseLatency = .01; outputLatency = .02; onstatechange?: () => void;
  async resume() {} async close() {this.state = 'closed';}
  getOutputTimestamp() {return {contextTime: 1, performanceTime: performance.now()};}
}
class WorkerStub {
  static last: WorkerStub; onmessage?: (event: {data: unknown}) => void; onerror?: () => void; finishes = 0; epoch = 0;
  constructor() {WorkerStub.last = this;}
  postMessage(data: {type: string; epoch: number}) {
    this.epoch = data.epoch;
    if (data.type === 'finish') {++this.finishes; queueMicrotask(() => this.onmessage?.({data: {type: 'final', epoch: this.epoch, state: {
      assessments: [], extras: [], cursor: 0, done: false, faults: [], firstTry: 0, groupsDone: 0, corrections: 0, held: [], missing: [],
    }}}));}
  }
  terminate() {}
}
async function withBrowserStubs(action: (session: PracticeSession) => Promise<void>) {
  const previous = {Worker: (globalThis as any).Worker, AudioContext: (globalThis as any).AudioContext, window: (globalThis as any).window};
  Object.assign(globalThis, {Worker: WorkerStub, AudioContext: AudioStub, window: {setInterval}});
  const config = defaultConfig(score); config.countIn = 0; config.metronome = false;
  const session = new PracticeSession(buildPlan(score, config), 'Test');
  try {await action(session);} finally {session.dispose(); Object.assign(globalThis, previous);}
}
test('concurrent Finish actions publish one result and resolve both callers', () => withBrowserStubs(async session => {
  await session.start(); const first = session.finish(), second = session.finish();
  const [a, b] = await Promise.all([first, second]); assert.equal(a.id, b.id); assert.equal(WorkerStub.last.finishes, 1);
  assert.equal((await session.finish()).id, a.id); assert.equal(a.outcome, 'aborted');
}));
test('failed worker can finish with an interrupted partial result, without hanging', () => withBrowserStubs(async session => {
  await session.start(); WorkerStub.last.onerror?.();
  const result = await session.finish(); assert.equal(result.outcome, 'interrupted'); assert.ok(result.faults.includes('worker-error'));
  assert.equal(WorkerStub.last.finishes, 0); assert.equal(result.evaluated, 0);
}));
test('unavailable session input is rejected before audio/worker setup', async () => {
  const session = new PracticeSession(buildPlan(score, defaultConfig(score)), 'Test', () => false);
  await assert.rejects(() => session.start(), /thiết bị/); assert.equal(session.status, 'ready');
});
