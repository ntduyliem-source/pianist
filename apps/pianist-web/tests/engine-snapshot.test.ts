import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {ScoreSnapshot} from '../../../packages/score-contracts/index';
import {buildPlan, defaultConfig} from '../../../packages/practice-core/plan';
import {BpmCore} from '../../../packages/practice-core/bpm';
const score = JSON.parse(readFileSync(new URL('../../../tests/fixtures/pianist/practice/engine-snapshot.json', import.meta.url), 'utf8')) as ScoreSnapshot;
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < .01, `${actual} != ${expected}`);
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
