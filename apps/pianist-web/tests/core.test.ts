import test from 'node:test';
import assert from 'node:assert/strict';
import { BpmCore } from '../../../packages/practice-core/bpm';
import { WaitCore } from '../../../packages/practice-core/wait';
import { buildPlan, defaultConfig } from '../../../packages/practice-core/plan';
import { summarize } from '../../../packages/practice-core/results';
import { replay } from '../../../packages/practice-core/replay';
import { ALGORITHM_VERSION, type Attack, type InputEvent, type Plan, type ScoreSnapshot } from '../../../packages/score-contracts/index';

const config = {mode: 'bpm' as const, bpm: 120, beatQuarter: 1, countIn: 0, metronome: false, fromMeasure: 0, toMeasure: 0,
  hand: 'both' as const, roles: {0: 'right' as const, 1: 'left' as const}, voices: [0, 1, 2, 3], loops: 1, offsetMs: 0,
  perfectMs: 50, goodMs: 120, windowMs: 250, deliveryMs: 120, inputSource: 'virtual' as const, deviceId: 'virtual', algorithmVersion: ALGORITHM_VERSION};
function makePlan(notes: [number, number, number?][]): Plan {
  const targets: Attack[] = notes.map(([atMs, pitch, staff = 0], i) => ({id: String(i), pitch, atMs, endMs: atMs + 100, anchors: [String(i)], roles: [staff ? 'left' : 'right'], measure: 0, occurrence: 0, loop: 0}));
  const groups: Plan['groups'] = [];
  for (const t of targets) {const g = groups.find(g => g.atMs === t.atMs); if (g) g.targets.push(t); else groups.push({atMs: t.atMs, endMs: t.endMs, targets: [t]});}
  const durationMs = Math.max(...targets.map(t => t.endMs));
  return {schemaVersion: 1, projectId: 'p', revision: 3, fingerprint: 'hash', targets, durationMs, config: {...config}, groups, beats: [], loops: [{index: 0, startMs: 0, endMs: durationMs}]};
}
let seq = 0;
const e = (atMs: number, pitch: number, type: InputEvent['type'] = 'on', delay = 0): InputEvent => ({seq: ++seq, epoch: 1, type, pitch, velocity: type === 'on' ? 80 : 0, channel: 0, deviceId: 'virtual', atMs, receivedMs: atMs + delay, source: 'virtual'});
function hit(core: BpmCore | WaitCore, at: number, pitch: number) {core.input(e(at, pitch)); core.input(e(at + 20, pitch, 'off'));}
const finish = (core: BpmCore) => core.advance(core.plan.durationMs + 1000);

test('T01–03: exact onsets, inclusive timing thresholds and pitch errors', () => {
  const p = makePlan([[1000, 60], [2000, 62], [3000, 64], [4000, 65]]), core = new BpmCore(p);
  hit(core, 1000, 60); hit(core, 2050, 62); hit(core, 3120, 64); hit(core, 4000, 66);
  const s = finish(core), r = summarize(p, s, 'Test', 'complete', 5000, 'test');
  assert.deepEqual(s.assessments.map(a => a.grade), ['perfect', 'perfect', 'good', undefined]);
  assert.equal(r.matched, 3); assert.equal(r.missed, 1); assert.equal(r.extras, 1); assert.equal(r.precision, .75);
});
test('T04–05: chord -100/+100 is not perfect or zero-error', () => {
  const p = makePlan([[1000, 60], [1000, 64]]), core = new BpmCore(p); hit(core, 900, 60); hit(core, 1100, 64);
  const r = summarize(p, finish(core), 'Chord', 'complete', 2000, 'test');
  assert.equal(r.medianAbsMs, 100); assert.equal(r.signedMeanMs, 0); assert.equal(r.chords[0].spreadMs, 200);
  assert.equal(r.assessments.filter(a => a.grade === 'perfect').length, 0);
});
test('T11: missing middle repeated pitch does not shift subsequent notes', () => {
  const p = makePlan([[1000, 60], [1200, 60], [1400, 60], [1600, 60]]), core = new BpmCore(p);
  hit(core, 1000, 60); hit(core, 1400, 60); hit(core, 1600, 60);
  const s = finish(core); assert.deepEqual(s.assessments.map(a => a.status), ['matched', 'missed', 'matched', 'matched']);
  assert.equal(new Set(s.assessments.flatMap(a => a.eventSeq ?? [])).size, 3);
});
test('T12: left-hand miss does not stop right-hand timeline', () => {
  const p = makePlan([[1000, 48, 1], [1000, 60], [1500, 62], [2000, 64]]), core = new BpmCore(p);
  hit(core, 1000, 60); hit(core, 1500, 62); hit(core, 2000, 64); const s = finish(core);
  assert.equal(s.assessments.find(a => a.targetId === '0')?.status, 'missed'); assert.equal(s.assessments.filter(a => a.status === 'matched').length, 3);
});
test('T15: same event timestamps at 15/60/144 FPS yield identical final grading', () => {
  const p = makePlan(Array.from({length: 30}, (_, i) => [500 + i * 120, 60]));
  const events = p.targets.filter((_, i) => i % 7 !== 3).flatMap(t => [e(t.atMs + 35, 60), e(t.atMs + 60, 60, 'off')]);
  function replay(fps: number) {const core = new BpmCore(p); let index = 0;
    for (let now = 0; now < p.durationMs + 1000; now += 1000 / fps) {
      while (index < events.length && events[index].receivedMs <= now) core.input(events[index++]); core.advance(now);
    } return finish(core);
  }
  assert.deepEqual(replay(15), replay(60)); assert.deepEqual(replay(60), replay(144));
});
test('T16: input delayed beyond budget is marked unreliable; no false miss finalized', () => {
  const core = new BpmCore(makePlan([[1000, 60]])); core.input(e(1000, 60, 'on', 600));
  const s = finish(core); assert.deepEqual(s.faults, ['delivery-delay']); assert.equal(s.assessments.length, 0); assert.equal(s.done, false);
});
test('T16: fixed calibration offset shifts input once', () => {
  const p = makePlan([[1000, 60]]); p.config.offsetMs = 80; const core = new BpmCore(p); hit(core, 1080, 60);
  assert.equal(finish(core).assessments[0].deltaMs, 0);
});
test('T17–18: extra keys reduce precision; silence completes with all misses', () => {
  const p = makePlan([[1000, 60], [2000, 62]]), core = new BpmCore(p);
  hit(core, 1000, 60); hit(core, 1000, 61); hit(core, 2000, 62);
  assert.equal(summarize(p, finish(core), '', 'complete', 3000, '').precision, 2 / 3);
  const silent = finish(new BpmCore(p)); assert.equal(silent.done, true); assert.equal(silent.assessments.filter(a => a.status === 'missed').length, 2);
});

test('an extra attack of a previously finalized pitch does not interrupt the timeline', () => {
  const p = makePlan([[1000, 60], [3000, 62]]), core = new BpmCore(p);
  hit(core, 1000, 60); core.advance(2000);
  hit(core, 2400, 60); hit(core, 3000, 62);
  const s = finish(core), r = summarize(p, s, 'Extra after closed pitch', 'complete', 4000, 'test');
  assert.deepEqual(s.faults, []); assert.equal(s.done, true);
  assert.equal(r.matched, 2); assert.equal(r.extras, 1); assert.equal(r.precision, 2 / 3);
});

test('an unmatched pitch near the end is counted before the result completes', () => {
  const p = makePlan([[1000, 60]]), core = new BpmCore(p);
  hit(core, 1000, 60); core.advance(1200); hit(core, p.durationMs + 200, 61);
  const s = core.advance(p.durationMs + p.config.windowMs + p.config.deliveryMs + 1);
  assert.equal(s.done, true); assert.equal(s.extras.length, 1);
  assert.equal(summarize(p, s, 'Late extra', 'complete', 2000, 'test').precision, .5);
});

test('positive calibration keeps valid late-window inputs open until their delivery deadline', () => {
  const p = makePlan([[1000, 60], [3000, 62]]); p.config.offsetMs = 80;
  const core = new BpmCore(p); core.advance(1400);
  assert.equal(core.state().assessments.length, 0);
  core.input(e(1330, 60, 'on', 120)); core.input(e(1350, 60, 'off', 120));
  core.advance(1451); hit(core, 3080, 62);
  const s = finish(core); assert.deepEqual(s.faults, []);
  assert.equal(s.assessments[0].status, 'matched'); assert.equal(s.assessments[0].deltaMs, 250);
  assert.equal(s.assessments[0].grade, 'outside'); assert.equal(s.assessments[1].deltaMs, 0);
});

test('inclusive delivery boundary is not finalized before an input at that same boundary', () => {
  const p = makePlan([[1000, 60]]), core = new BpmCore(p);
  core.advance(1370); core.input(e(1250, 60, 'on', 120));
  const s = finish(core); assert.deepEqual(s.faults, []);
  assert.equal(s.assessments[0].status, 'matched'); assert.equal(s.assessments[0].deltaMs, 250);
});

test('positive offset extends completion through the last permitted input delivery', () => {
  const p = makePlan([[1000, 60]]); p.config.offsetMs = 80;
  const core = new BpmCore(p); hit(core, 1080, 60);
  const uncalibratedEnd = p.durationMs + p.config.windowMs + p.config.deliveryMs;
  assert.equal(core.advance(uncalibratedEnd + 1).done, false);
  core.input(e(p.durationMs + p.config.windowMs + 80, 61, 'on', 120));
  const s = core.advance(uncalibratedEnd + 81);
  assert.equal(s.done, true); assert.equal(s.extras.length, 1); assert.deepEqual(s.faults, []);
});
test('T06: wait requires complete held chord; wrong notes never advance', () => {
  const p = makePlan([[0, 60], [0, 64], [500, 67]]); p.config.mode = 'wait'; const core = new WaitCore(p);
  hit(core, 0, 61); core.input(e(10, 60)); assert.equal(core.state().groupsDone, 0);
  core.input(e(20, 60, 'off')); core.input(e(30, 64)); assert.equal(core.state().groupsDone, 0);
  core.input(e(40, 60)); assert.equal(core.state().groupsDone, 1); assert.equal(core.state().firstTry, 0); assert.equal(core.state().corrections, 1);
});
test('T07: held/duplicate key is not a repeated attack', () => {
  const p = makePlan([[0, 60], [100, 60]]); p.config.mode = 'wait'; const core = new WaitCore(p);
  core.input(e(0, 60)); core.input(e(10, 60)); assert.equal(core.state().groupsDone, 1);
  core.input(e(20, 60, 'off')); core.input(e(30, 60)); assert.equal(core.state().done, true);
});
test('T09: reference rest must elapse in wait mode', () => {
  const p = makePlan([[0, 60], [1000, 62]]); p.config.mode = 'wait'; const core = new WaitCore(p);
  hit(core, 0, 60); hit(core, 100, 62); assert.equal(core.state().groupsDone, 1);
  hit(core, 901, 62); assert.equal(core.state().done, true); assert.equal(core.state().corrections, 1);
});
test('partial result excludes targets whose matching windows are still open', () => {
  const p = makePlan([[1000, 60], [10000, 62]]), core = new BpmCore(p); hit(core, 1000, 60);
  const r = summarize(p, core.advance(2000), '', 'aborted', 2000, 'test'); assert.equal(r.evaluated, 1); assert.equal(r.planned, 2); assert.equal(r.missed, 0);
});

function snapshot(): ScoreSnapshot {
  const anchors = [
    {id: 'a', pitch: 60, tick: 0, durationTicks: 480, measure: 0, staff: 0},
    {id: 'u', pitch: 60, tick: 0, durationTicks: 480, measure: 0, staff: 1},
    {id: 'b', pitch: 60, tick: 480, durationTicks: 480, measure: 1, staff: 0, tieBack: 'a'},
    {id: 'c', pitch: 62, tick: 640, durationTicks: 160, measure: 1, staff: 1},
  ].map(a => ({...a, visualStaff: a.staff, track: a.staff * 4, voice: 0, page: 0, visible: true, play: true, box: {x: 0, y: 0, width: 5, height: 5}}));
  return {schemaVersion: 1, projectId: 'p', revision: 2, fingerprint: 'f', title: 'Fixture', baseQuarterBpm: 120, durationMs: 1500,
    staves: [{id: 0, part: 'Piano', partId: 'p'}, {id: 1, part: 'Piano', partId: 'p'}], pages: [], anchors,
    measures: [0, 1].map(index => ({index, label: index + 1, tick: index * 480, endTick: (index + 1) * 480, page: 0, box: {x: 0, y: 0, width: 1, height: 1}, numerator: 1, denominator: 4})),
    occurrences: [{index: 0, measure: 0, startMs: 0, endMs: 500, utick: 0}, {index: 1, measure: 1, startMs: 500, endMs: 1500, utick: 480}],
    performed: [{anchor: 'a', occurrence: 0, atMs: 0, endMs: 500}, {anchor: 'u', occurrence: 0, atMs: 0, endMs: 500}, {anchor: 'b', occurrence: 1, atMs: 500, endMs: 1500}, {anchor: 'c', occurrence: 1, atMs: 833.333, endMs: 1166.666}],
    beats: [{atMs: 0, accent: true, occurrence: 0}, {atMs: 500, accent: true, occurrence: 1}], warnings: []};
}
test('T08/13/14: engine timing, unison, ties, tuplets, tempo and loop occurrence', () => {
  const s = snapshot(), c = defaultConfig(s); c.loops = 2; const p = buildPlan(s, c);
  assert.equal(p.targets.length, 4); assert.deepEqual(new Set(p.targets[0].anchors), new Set(['a', 'u', 'b']));
  assert.equal(p.targets[0].endMs, 1500); assert.equal(p.targets[1].atMs, 833.333);
  assert.equal(p.targets[2].atMs, 2000); assert.equal(new Set(p.targets.map(t => t.id)).size, 4);
});
test('starting inside a tie creates an explicit first attack, roles follow source staff', () => {
  const s = snapshot(), c = defaultConfig(s); c.fromMeasure = 1; c.hand = 'right'; const p = buildPlan(s, c);
  assert.equal(p.targets.length, 1); assert.equal(p.targets[0].pitch, 60); assert.equal(p.targets[0].atMs, 0);
});
test('practice tempo/beat unit does not mutate the source snapshot', () => {
  const s = snapshot(), before = JSON.stringify(s), c = defaultConfig(s); c.bpm = 80; c.beatQuarter = 1.5;
  const p = buildPlan(s, c); assert.equal(p.durationMs, 1500); assert.equal(JSON.stringify(s), before);
});
test('high-density blocks remain bounded and cannot reuse events across boundaries', () => {
  const p = makePlan(Array.from({length: 100}, (_, i) => [500 + i * 30, 60])); const core = new BpmCore(p);
  for (const t of p.targets) hit(core, t.atMs, t.pitch); const s = finish(core);
  assert.equal(s.assessments.filter(a => a.status === 'matched').length, 100); assert.equal(new Set(s.assessments.map(a => a.eventSeq)).size, 100);
});
test('replay includes pause key-state boundaries and matches the worker command sequence', () => {
  const p = makePlan([[0, 60], [100, 60]]); p.config.mode = 'wait';
  const first = e(0, 60), second = e(100, 60);
  const s = replay(p, [{kind: 'event', event: first}, {kind: 'advance', atMs: 20},
    {kind: 'clearHeld', atMs: 20}, {kind: 'event', event: second}, {kind: 'advance', atMs: 120}]);
  assert.equal(s.done, true); assert.equal(s.assessments.length, 2); assert.equal(s.firstTry, 2);
});

test('replay refuses a different algorithm version instead of silently regrading old history', () => {
  const p = makePlan([[0, 60]]); p.config.algorithmVersion = 'pianist-onset-1.0.0';
  assert.throws(() => replay(p, []), /matching source release/);
});
test('a boundary input can score only one occurrence across repeated loops', () => {
  const p = makePlan([[500, 60], [800, 60]]); p.targets[1].loop = 1;
  const c = new BpmCore(p); hit(c, 650, 60); const s = finish(c);
  assert.equal(s.assessments.filter(a => a.status === 'matched').length, 1);
  assert.equal(s.assessments.filter(a => a.status === 'missed').length, 1);
});
test('engine-provided beat grids preserve tempo changes instead of interpolating a new tempo', () => {
  const s = snapshot(); s.beats = [{atMs: 0, accent: true, occurrence: 0, beatQuarter: .5},
    {atMs: 190, accent: false, occurrence: 0, beatQuarter: .5}, {atMs: 500, accent: true, occurrence: 1, beatQuarter: .5}];
  const c = defaultConfig(s); c.beatQuarter = .5; c.bpm = 240;
  assert.deepEqual(buildPlan(s, c).beats.map(b => b.atMs), [0, 190, 500]);
});
