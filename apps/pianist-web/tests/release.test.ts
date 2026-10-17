import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BpmCore} from '../../../packages/practice-core/bpm';
import {buildPlan, defaultConfig} from '../../../packages/practice-core/plan';
import {replay} from '../../../packages/practice-core/replay';
import {resultCsv, summarize} from '../../../packages/practice-core/results';
import {comparable} from '../../../packages/practice-core/comparison';
import type {InputEvent, ScoreSnapshot, SessionResult} from '../../../packages/score-contracts/index';
import {midiPlan, simulate} from './helpers/midi-simulation';

let seq = 0;
const event = (atMs: number, type: InputEvent['type'], pitch: number, velocity = type === 'on' ? 90 : 0, channel = 0): InputEvent =>
  ({seq: ++seq, epoch: 1, type, pitch, velocity, channel, deviceId: 'simulated-piano', source: 'midi', atMs, receivedMs: atMs});

test('release grading separates short/good/long/missing releases from all-correct onsets', () => {
  const plan = midiPlan([[1000, 60, 2000], [2500, 62, 3500], [4000, 64, 5000], [5500, 65, 6500]], {releaseMode: 'key'});
  const core = new BpmCore(plan);
  for (const [at, pitch, off] of [[1000, 60, 1500], [2500, 62, 3500], [4000, 64, 5240], [5500, 65, null]] as const) {
    core.input(event(at, 'on', pitch)); core.advance(at + 380); if (off !== null) core.input(event(off, 'off', pitch));
  }
  const state = core.advance(7000), result = summarize(plan, state, '', 'complete', 7000, 'test');
  assert.equal(state.done, true); assert.equal(result.timingRate, 1); assert.equal(result.releaseRate, .25);
  assert.deepEqual(result.releases?.map(r => r.status), ['short', 'good', 'long', 'unreleased']);
});

test('sustain extends only released keys on its own channel; retrigger ends the old sounding occurrence', () => {
  const plan = midiPlan([[1000, 60, 2000], [1000, 64, 2000], [2000, 60, 2500]], {releaseMode: 'sustain'}), core = new BpmCore(plan);
  core.input(event(900, 'pedal', 64, 127)); core.input(event(1000, 'on', 60)); core.input(event(1000, 'on', 64, 90, 1));
  core.input(event(1200, 'off', 60)); core.input(event(1200, 'off', 64, 0, 1)); core.advance(1400);
  core.input(event(2000, 'on', 60)); core.input(event(2100, 'off', 60)); core.input(event(2500, 'pedal', 64));
  const result = summarize(plan, core.advance(3000), '', 'complete', 3000, 'test');
  assert.deepEqual(result.releases?.map(r => r.status), ['good', 'short', 'good']);
  assert.equal(result.matched, 3); assert.equal(result.releaseRate, 2 / 3);
});

test('late onset keeps the final release window open and does not get a second timing penalty', () => {
  const plan = midiPlan([[1000, 60, 2000]], {releaseMode: 'key'}), core = new BpmCore(plan);
  core.input(event(1240, 'on', 60)); core.advance(1400);
  assert.equal(core.advance(2300).done, false);
  core.input(event(2240, 'off', 60)); const state = core.advance(2500);
  assert.equal(state.done, true); assert.equal(state.releases?.[0].status, 'good'); assert.equal(state.assessments[0].grade, 'outside');
});

test('unsupported ornament duration is excluded, while staccato uses half the notated duration', () => {
  const plan = midiPlan([[1000, 60, 2000], [2500, 64, 3500]], {releaseMode: 'key'});
  plan.targets[0].releaseRatio = .5; plan.targets[1].releaseUnsupported = true;
  const core = new BpmCore(plan); core.input(event(1000, 'on', 60)); core.input(event(1500, 'off', 60)); core.input(event(2500, 'on', 64));
  const result = summarize(plan, core.advance(4000), '', 'complete', 4000, 'test');
  assert.deepEqual(result.releases?.map(r => r.status), ['good', 'unscored']); assert.equal(result.releaseRate, 1);
});

test('real worker returns release deltas once and simulated disconnect never becomes a short-note fault', async () => {
  await simulate(midiPlan([[1000, 60, 2000], [3000, 64, 4000]], {releaseMode: 'key'}), async sim => {
    await sim.send(1000, [0x90, 60, 90]); await sim.go(1500); await sim.disconnect();
    await sim.reconnect(); await sim.send(3000, [0x90, 64, 90]); await sim.send(4000, [0x80, 64, 0]);
    const result = await sim.complete();
    assert.deepEqual(result.releases?.map(r => r.status), ['interrupted', 'good']); assert.equal(result.releaseRate, 1);
    assert.equal(result.releases?.length, 2);
    assert.deepEqual(replay(sim.plan, sim.session.commands).releases?.sort((a, b) => a.targetId.localeCompare(b.targetId)), result.releases);
  });
});

test('an invalid Note Off timestamp interrupts a duration-scored session without inventing release accuracy', async () => {
  await simulate(midiPlan([[1000, 60, 2000]], {releaseMode: 'key'}), async sim => {
    await sim.send(1000, [0x90, 60, 90]); await sim.send(2000, [0x80, 60, 0], 121);
    assert.equal(sim.session.status, 'interrupted'); assert.ok(sim.session.state.faults.includes('delivery-delay'));
    const result = await sim.session.finish('interrupted'); assert.equal(result.releaseRate, null);
  });
});

test('arpeggio profiles follow direction, stay within half-duration, and do not mutate score/Wait mode', () => {
  const snapshot = JSON.parse(readFileSync(new URL('../../../tests/fixtures/pianist/practice/special-symbols-snapshot.json', import.meta.url), 'utf8')) as ScoreSnapshot;
  const first = snapshot.anchors.filter(a => a.tick === 0);
  assert.equal(first.length, 3);
  first.forEach(a => {a.arpeggio = 'down'; a.arpeggioGroup = 'first';});
  const config = {...defaultConfig(snapshot), mode: 'bpm' as const, arpeggioMs: 120}, before = structuredClone(snapshot);
  const plan = buildPlan(snapshot, config), rolled = plan.targets.filter(t => first.some(a => t.anchors.includes(a.id)));
  assert.deepEqual(rolled.map(t => t.pitch), [67, 64, 60]);
  assert.deepEqual(rolled.map(t => Math.round(t.atMs)), [0, 60, 120]); assert.deepEqual(snapshot, before);
  const waiting = buildPlan(snapshot, {...config, mode: 'wait', releaseMode: 'key'});
  assert.equal(waiting.groups[0].targets.length, 3); assert.equal(waiting.config.releaseMode, 'off'); assert.equal(waiting.config.arpeggioMs, 0);
});

test('duration and arpeggio policies cannot be mixed in progress comparisons', () => {
  const plan = midiPlan([[0, 60]], {releaseMode: 'key'}), core = new BpmCore(plan);
  const a = summarize(plan, core.advance(1000), '', 'complete', 1000, 'test');
  const b: SessionResult = {...structuredClone(a), id: 'other', config: {...a.config, releaseMode: 'sustain'}};
  assert.equal(comparable(a, b), false); b.config.releaseMode = 'key'; b.config.arpeggioMs = 120; assert.equal(comparable(a, b), false);
});

test('native snapshot preserves staccato/staccatissimo, descending arpeggio and unsupported ornament duration', () => {
  const snapshot = JSON.parse(readFileSync(new URL('../../../tests/fixtures/pianist/practice/release-policy-snapshot.json', import.meta.url), 'utf8')) as ScoreSnapshot;
  const plan = buildPlan(snapshot, {...defaultConfig(snapshot), mode: 'bpm', releaseMode: 'key', arpeggioMs: 120});
  assert.deepEqual(plan.targets.slice(0, 3).map(t => [t.pitch, t.releaseRatio]), [[60, .5], [62, .25], [64, 1]]);
  assert.deepEqual(plan.targets.slice(3, 6).map(t => [t.pitch, Math.round(t.atMs)]), [[67, 4000], [64, 4060], [60, 4120]]);
  assert.equal(plan.targets[6].releaseUnsupported, true);
  const core = new BpmCore(plan);
  for (const [on, off, pitch] of [[0, 500, 60], [1000, 1250, 62], [2000, 4000, 64]]) {
    core.input(event(on, 'on', pitch)); core.input(event(off, 'off', pitch));
  }
  core.advance(8500);
  assert.deepEqual(core.state().releases?.map(r => r.status), ['good', 'good', 'good']);
});

test('CSV retains release measurements and extras, supports old results, and escapes imported identifiers', () => {
  const plan = midiPlan([[1000, 60, 2000]], {releaseMode: 'key'}), core = new BpmCore(plan);
  core.input(event(1000, 'on', 60)); core.input(event(1500, 'off', 60)); core.input(event(1600, 'on', 61));
  const result = summarize(plan, core.advance(3000), '', 'complete', 3000, 'test');
  const csv = resultCsv(result).split('\r\n');
  assert.equal(csv.length, 3); assert.match(csv[1], /,key,short,1000,500,-500,/); assert.match(csv[2], /,61,extra,/);
  result.assessments[0].targetId = '=IMPORTDATA("untrusted")'; result.targets[0].id = result.assessments[0].targetId;
  assert.match(resultCsv(result), /"'=IMPORTDATA\(""untrusted""\)"/);
  delete result.releases; delete result.releaseRate; delete result.config.releaseMode;
  assert.match(resultCsv(result), /,off,,,,,/);
});
