import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {BpmCore} from '../../packages/practice-core/bpm';
import {ALGORITHM_VERSION, type Attack, type Plan} from '../../packages/score-contracts/index';

const count = 50000, start = performance.now();
const targets: Attack[] = Array.from({length: count}, (_, i) => ({id: String(i), pitch: 21 + i % 88, atMs: 1000 + i * 50, endMs: 1040 + i * 50,
  anchors: [String(i)], roles: ['right'], measure: Math.floor(i / 16), occurrence: Math.floor(i / 16), loop: 0}));
const plan: Plan = {schemaVersion: 1, projectId: 'synthetic-benchmark', revision: 1, fingerprint: 'synthetic', targets, durationMs: targets.at(-1)!.endMs,
  config: {mode: 'bpm', bpm: 120, beatQuarter: 1, countIn: 0, metronome: false, fromMeasure: 0, toMeasure: 3124, hand: 'both', roles: {0: 'right'}, voices: [0], loops: 1,
    offsetMs: 0, perfectMs: 50, goodMs: 120, windowMs: 250, deliveryMs: 120, inputSource: 'virtual', deviceId: 'virtual', algorithmVersion: ALGORITHM_VERSION},
  beats: [], groups: targets.map(t => ({atMs: t.atMs, endMs: t.endMs, targets: [t]})), loops: [{index: 0, startMs: 0, endMs: targets.at(-1)!.endMs}]};
const core = new BpmCore(plan), built = performance.now(), timings: number[] = [];
let seq = 0, sent = 0, received = 0;
for (const target of targets) {
  const before = performance.now();
  core.input({seq: ++seq, epoch: 1, type: 'on', pitch: target.pitch, velocity: 90, channel: 0, deviceId: 'virtual', source: 'virtual', atMs: target.atMs, receivedMs: target.atMs});
  core.input({seq: ++seq, epoch: 1, type: 'off', pitch: target.pitch, velocity: 0, channel: 0, deviceId: 'virtual', source: 'virtual', atMs: target.atMs + 1, receivedMs: target.atMs + 1});
  const state = core.advance(target.atMs + 1, sent, 0); received += state.assessments.length; sent = core.assessments.length;
  timings.push(performance.now() - before);
}
const final = core.advance(plan.durationMs + 1000, sent, 0); received += final.assessments.length;
if (!final.done || received !== count || core.assessments.some(a => a.status !== 'matched') || final.faults.length) throw Error('Stress replay failed');
timings.sort((a, b) => a - b);
const output = {algorithm: ALGORITHM_VERSION, synthetic: true, notes: count, events: seq, receivedAssessments: received, faults: final.faults,
  buildMs: built - start, replayMs: performance.now() - built, stepMedianMs: timings[Math.floor(count / 2)], stepP99Ms: timings[Math.floor(count * .99)],
  stepMaxMs: timings.at(-1), processHeapMiB: process.memoryUsage().heapUsed / 1024 ** 2,
  scope: 'Node domain replay with delta states; excludes DOM, browser audio and physical MIDI. Not a latency certification.'};
writeFileSync('artifacts/m1-m6/core-stress.json', JSON.stringify(output, null, 2)); console.log(JSON.stringify(output, null, 2));
