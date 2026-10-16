import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {buildPlan, defaultConfig} from '../../../packages/practice-core/plan';
import type {ScoreSnapshot} from '../../../packages/score-contracts/index';
import {MidiRouter} from '../src/platform/midi';

test('simulated MIDI router → actual worker module returns per-note feedback without waiting for a timer tick', async () => {
  const workerFile = fileURLToPath(new URL('../../../packages/practice-worker/practice.worker.ts', import.meta.url));
  const worker = new Worker(`const {parentPort, workerData} = require('node:worker_threads');
    require('tsx/cjs/api').register();
    global.self = {postMessage: data => parentPort.postMessage(data)};
    require(workerData);
    parentPort.on('message', data => self.onmessage({data}));`, {eval: true, workerData: workerFile});
  const reply = (action: () => void) => new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Worker did not reply to input')), 5000);
    worker.once('message', data => {clearTimeout(timer); resolve(data);}); worker.once('error', reject); action();
  });
  try {
    const snapshot = JSON.parse(readFileSync(new URL('../../../tests/fixtures/pianist/practice/engine-snapshot.json', import.meta.url), 'utf8')) as ScoreSnapshot;
    const plan = buildPlan(snapshot, defaultConfig(snapshot)), midi = new MidiRouter(); midi.deviceId = 'test-midi';
    const first = plan.groups[0]; assert.ok(first.targets.length > 1);
    await reply(() => worker.postMessage({type: 'init', epoch: 4, plan}));
    midi.onInput = event => worker.postMessage({type: 'event', epoch: 4, event: {...event, atMs: 0, receivedMs: 1}});
    const send = (pitch: number, velocity = 90) => midi.receive([0x90, pitch, velocity], performance.now(), 'test-midi', 'midi');
    let response = await reply(() => send(first.targets[0].pitch));
    assert.equal(response.type, 'progress'); assert.equal(response.state.assessments.length, 0);
    assert.equal(response.state.live[0].targetId, first.targets[0].id); assert.equal(response.state.live[0].provisional, true);
    response = await reply(() => send(first.targets[0].pitch, 0)); assert.equal(response.state.live.length, 0);
    await reply(() => send(first.targets[0].pitch));
    for (const target of first.targets.slice(1)) response = await reply(() => send(target.pitch));
    assert.equal(response.state.groupsDone, 1); assert.equal(response.state.assessments.length, first.targets.length);
    response = await reply(() => worker.postMessage({type: 'pause', epoch: 4})); assert.deepEqual(response.state.held, []);
    response = await reply(() => worker.postMessage({type: 'finish', epoch: 4}));
    assert.equal(response.type, 'final'); assert.deepEqual(response.state.assessments, [], 'worker sends each finalized assessment once');
  } finally {await worker.terminate();}
});
