import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {ScoreSnapshot} from '../../../packages/score-contracts/index';
import {buildPlan, defaultConfig} from '../../../packages/practice-core/plan';
import {BpmCore} from '../../../packages/practice-core/bpm';
const score = JSON.parse(readFileSync(new URL('../../../tests/fixtures/pianist/practice/engine-snapshot.json', import.meta.url), 'utf8')) as ScoreSnapshot;
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < .01, `${actual} != ${expected}`);
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../../tests/fixtures/pianist/practice/${name}-snapshot.json`, import.meta.url), 'utf8')) as ScoreSnapshot;

test('native first/second endings perform 1,2,1,3 with a fresh grading pass on return', () => {
  const s = fixture('volta'), p = buildPlan(s, defaultConfig(s));
  assert.deepEqual(s.occurrences.map(o => o.measure), [0, 1, 0, 2]);
  assert.deepEqual(p.targets.map(t => [t.atMs, t.pitch]), [[0, 60], [1000, 62], [2000, 60], [3000, 64]]);
  assert.deepEqual(p.visits?.map(v => v.pass), [0, 0, 1, 1]); near(p.durationMs, 4000);
});

test('explicit MusicXML D.C. al Fine survives default import settings and stops on the second Fine', () => {
  const s = fixture('da-capo'), p = buildPlan(s, defaultConfig(s));
  assert.deepEqual(s.occurrences.map(o => o.measure), [0, 1, 2, 0, 1]);
  assert.deepEqual(p.targets.map(t => [t.atMs, t.pitch]), [[0, 60], [1000, 62], [2000, 64], [3000, 60], [4000, 62]]);
  assert.deepEqual(p.visits?.map(v => v.pass), [0, 0, 0, 1, 1]); near(p.durationMs, 5000);
});

test('native D.S. al Coda returns to Segno and takes the Coda on its second pass', () => {
  const s = fixture('dal-segno-coda'), p = buildPlan(s, defaultConfig(s));
  assert.deepEqual(s.occurrences.map(o => o.measure), [0, 1, 2, 3, 1, 2, 4]);
  assert.deepEqual(p.targets.map(t => t.pitch), [60, 62, 64, 65, 62, 64, 67]); near(p.durationMs, 7000);
});

test('native cross-staff notes keep their musical hand while anchors follow the visual staff', () => {
  const s = fixture('cross-staff'), c = defaultConfig(s); c.hand = 'right';
  const p = buildPlan(s, c); assert.deepEqual(p.targets.map(t => t.pitch), [60, 62, 64, 65]);
  assert.deepEqual(s.anchors.filter(a => a.staff === 0 && a.visualStaff === 1).map(a => a.pitch), [62, 65]);
  c.hand = 'left'; assert.deepEqual(buildPlan(s, c).targets.map(t => t.pitch), [48]);
  near(p.durationMs, 4000);
});

test('independent voices on the same native staff can be practiced without changing notation', () => {
  const s = fixture('same-staff-voices'), c = defaultConfig(s); c.voices = [0];
  assert.deepEqual(buildPlan(s, c).targets.map(t => t.pitch), [60, 62, 64, 65]);
  c.voices = [1]; const p = buildPlan(s, c); assert.deepEqual(p.targets.map(t => t.pitch), [55]);
  near(p.targets[0].endMs, 4000); assert.ok(s.anchors.every(a => a.staff === 0));
});

test('native special symbols expose the grading policy and retain fermata playback duration', () => {
  const s = fixture('special-symbols'), p = buildPlan(s, defaultConfig(s));
  assert.deepEqual([...s.warnings].sort(), ['arpeggio', 'fermata', 'grace', 'ornament']);
  assert.deepEqual(p.targets.map(t => t.pitch), [60, 64, 67, 62, 64]);
  assert.equal(p.groups[0].targets.length, 3, 'arpeggio currently requires a complete ordinary chord');
  assert.equal(p.targets.some(t => t.pitch === 59), false, 'grace is explicitly excluded');
  // MuseScore resets fermata stretch one tick before release (Fraction::eps).
  near(p.durationMs, 6000 - 1000 / 480);
});
test('actual WASM snapshot agrees with independent pickup/tuplet/repeat/tie arithmetic', () => {
  assert.equal(score.anchors.length, 11); assert.equal(score.performed.length, 20); assert.equal(score.occurrences.length, 5);
  const p = buildPlan(score, defaultConfig(score)); assert.equal(p.targets.length, 16); near(p.durationMs, 4375);
  score.occurrences.forEach((o, i) => near(o.startMs, [0, 375, 1375, 2375, 3375][i]));
  const triplet = p.targets.filter(t => t.occurrence === 1 && t.roles.includes('right'));
  triplet.forEach((t, i) => near(t.atMs, [375, 541 + 2 / 3, 708 + 1 / 3, 875][i]));
  const tied = p.targets.find(t => t.pitch === 67)!; near(tied.atMs, 875); near(tied.endMs, 1875); assert.equal(tied.anchors.length, 2);
  const unison = p.targets.find(t => t.pitch === 62)!; assert.equal(unison.anchors.length, 2); assert.deepEqual(new Set(unison.roles), new Set(['left', 'right']));
});
test('actual engine plan can score one fresh input per physical target at all occurrences', () => {
  const config = defaultConfig(score); config.mode = 'bpm'; const plan = buildPlan(score, config), core = new BpmCore(plan); let seq = 0;
  for (const t of plan.targets) {
    for (const type of ['on', 'off'] as const) core.input({seq: ++seq, epoch: 1, type, pitch: t.pitch, velocity: type === 'on' ? 80 : 0,
      atMs: t.atMs + (type === 'off' ? 1 : 0), receivedMs: t.atMs + (type === 'off' ? 1 : 0), channel: 0, deviceId: 'virtual', source: 'virtual'});
  }
  const result = core.advance(plan.durationMs + 1000); assert.equal(result.assessments.length, 16);
  assert.equal(result.assessments.filter(a => a.grade === 'perfect').length, 16); assert.equal(result.extras.length, 0);
});
