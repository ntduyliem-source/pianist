import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreFixture, midi } from './helpers/fixtures-v2';
import { createTimeline, settingsFor } from '../../../packages/practice-engine-v2/score-adapter';
import { PracticeEngine } from '../../../packages/practice-engine-v2/engine';
import { resultFor } from '../../../packages/practice-engine-v2/results';
import { scorePositions } from '../src/practice/score-viewport';
import { noteSvgKey } from '../src/practice/note-ink';
import {
  decodeNativePracticeSnapshot,
  type NativePerformanceNote,
  type ScoreSnapshot,
} from '../../../packages/score-contracts';

const event = (
  anchor: string,
  pitch: number,
  atMs: number,
  endMs: number,
  occurrence = 0,
): NativePerformanceNote => ({
  anchors: [anchor],
  pitch,
  atMs,
  endMs,
  utick: Math.round(atMs * 0.96),
  endUtick: Math.round(endMs * 0.96),
  spans: [
    {
      anchor,
      occurrence,
      atMs,
      endMs,
      utick: Math.round(atMs * 0.96),
      endUtick: Math.round(endMs * 0.96),
    },
  ],
});
function score() {
  const s = scoreFixture();
  s.anchors[0].tick = 0;
  s.anchors.push({
    ...s.anchors[0],
    id: 'm0-t0-v0-g0-n0',
    pitch: 59,
    grace: true,
    durationTicks: 0,
  });
  s.anchors.push({ ...s.anchors[0], id: 'left', pitch: 48, staff: 1, visualStaff: 1, track: 4 });
  s.staves.push({ id: 1, part: 'Piano', partId: 'p' });
  s.unsupported = ['grace', 'ornament', 'arpeggio', 'pause'].map((kind) => ({
    kind: kind as any,
    measure: 0,
  }));
  s.durationReference = 'musescore-midi';
  s.performance = {
    source: 'musescore-mpe',
    events: [
      event('m0-t0-v0-g0-n0', 59, 0, 30),
      event('left', 48, 0, 900),
      event('n', 60, 31.25, 150),
      event('n', 62, 150, 250),
      event('n', 60, 250, 350),
    ],
  };
  return s;
}
test('MPE events replace written approximations for ornaments and grace in both modes; original kernels consume them', () => {
  const s = score();
  for (const mode of ['bpm', 'wait'] as const) {
    const t = createTimeline(s, { ...settingsFor(s), mode, tempoMode: 'score' });
    assert.equal(t.targets.length, 5);
    assert(t.targets.some((n) => n.pitch === 59));
    assert.deepEqual(
      t.targets.filter((n) => n.anchors.includes('n')).map((n) => [n.pitch, n.atMs, n.releaseMs]),
      [
        [60, 31.25, 150],
        [62, 150, 250],
        [60, 250, 350],
      ],
    );
    const engine = new PracticeEngine(t);
    let seq = 0;
    const events = t.targets
      .flatMap((n) => [
        midi(++seq, 'on', n.atMs, n.pitch),
        midi(++seq, 'off', n.releaseMs!, n.pitch),
      ])
      .sort((a, b) => a.timestampMs - b.timestampMs || (a.kind === 'off' ? -1 : 1));
    events.forEach((e, i) => engine.input({ ...e, sequence: i + 1 }));
    engine.clock(3000);
    const result = resultFor(t, engine.view(), 'MPE', 'complete', 3000);
    assert.equal(result.metrics.hits, 5);
    assert.equal(result.metrics.misses, 0);
    assert.equal(result.metrics.extras, 0);
    if (mode === 'bpm') assert(result.r4!.key.every((j) => j.status === 'correct'));
  }
  assert.equal(noteSvgKey('m0-t0-v0-g0-n0'), 't0-v0-g0-n0');
});
test('MPE selection keeps other hands out of grading while retaining their native guide notes', () => {
  const s = score(),
    c = { ...settingsFor(s), mode: 'bpm' as const, hand: 'right' as const, accompaniment: true };
  const t = createTimeline(s, c);
  assert.equal(t.targets.length, 4);
  assert.equal(t.guide.length, 1);
  assert.equal(t.guide[0].pitch, 48);
  const left = createTimeline(s, { ...c, hand: 'left', accompaniment: false });
  assert.equal(left.targets.length, 1);
  assert.equal(left.guide.length, 0);
});
test('native tie is one attack, A/B cuts reattack at A and clear release/highlight on each loop', () => {
  const s = scoreFixture();
  s.anchors[0].tick = 0;
  s.anchors[0].durationTicks = 1920;
  s.measures.push({ ...s.measures[0], index: 1, tick: 1920, endTick: 3840 });
  s.occurrences.push({ index: 1, measure: 1, startMs: 2000, endMs: 4000, utick: 1920 });
  s.anchors.push({ ...s.anchors[0], id: 'tie', tick: 1920, measure: 1, tieBack: 'n' });
  const e = event('n', 60, 0, 3500);
  e.anchors.push('tie');
  e.spans[0].endMs = 2000;
  e.spans[0].endUtick = 1920;
  e.spans.push(event('tie', 60, 2000, 3500, 1).spans[0]);
  s.performance = { source: 'musescore-mpe', events: [e] };
  const full = createTimeline(s, { ...settingsFor(s), mode: 'bpm' });
  assert.equal(full.targets.length, 1);
  assert.equal(full.targets[0].anchors.length, 2);
  const cut = createTimeline(s, {
    ...settingsFor(s),
    mode: 'bpm',
    fromMeasure: 1,
    toMeasure: 1,
    loops: 2,
    loopBpmStep: 30,
  });
  assert.deepEqual(
    cut.targets.map((n) => n.anchors),
    [['tie'], ['tie']],
  );
  assert.equal(cut.targets[0].atMs, 0);
  assert.equal(cut.targets[0].releaseMs, 1500);
  assert.equal(cut.targets[1].atMs, 2500);
  assert.equal(cut.targets[1].releaseMs, 3700);
});
test('score tempo retains native fixed pause seconds and the cursor freezes; fixed BPM removes the pause', () => {
  const s = scoreFixture();
  s.occurrences[0].endMs = 4000;
  s.timeMap = [
    { occurrence: 0, tick: 0, atMs: 0 },
    { occurrence: 0, tick: 960, atMs: 1000 },
    { occurrence: 0, tick: 960, atMs: 3000 },
    { occurrence: 0, tick: 1920, atMs: 4000 },
  ];
  s.cursorSegments = [{ measure: 0, tick: 0, endTick: 1920, x: 0, endX: 100 }];
  const e = event('n', 60, 3000, 3500);
  e.utick = 960;
  e.endUtick = 1440;
  e.spans[0].utick = 960;
  e.spans[0].endUtick = 1440;
  s.performance = { source: 'musescore-mpe', events: [e] };
  const t = createTimeline(s, { ...settingsFor(s), mode: 'bpm', tempoMode: 'score', bpm: 60 });
  assert.equal(t.durationMs, 6000);
  assert.equal(t.targets[0].atMs, 4000);
  assert.equal(t.targets[0].releaseMs, 5000);
  const locate = scorePositions(s, t);
  assert.equal(locate(2100)!.x, 50);
  assert.equal(locate(3900)!.x, 50);
  const fixed = createTimeline(s, { ...t.settings, tempoMode: 'fixed' });
  assert.equal(fixed.durationMs, 4000);
  assert.equal(fixed.targets[0].atMs, 2000);
});
test('pedal for two piano parts is one physical reference and missing marks do not reject the score', () => {
  const s = score();
  s.staves[1].partId = 'p2';
  s.pedals = [
    { id: 0, partId: 'p', occurrence: 0, tick: 0, endTick: 960, atMs: 0, endMs: 1000 },
    { id: 1, partId: 'p2', occurrence: 0, tick: 480, endTick: 1440, atMs: 500, endMs: 1500 },
  ];
  const t = createTimeline(s, { ...settingsFor(s), mode: 'bpm' });
  assert.equal(t.pedalReference, true);
  assert.equal(t.pedals!.length, 1);
  assert.equal(t.pedals![0].endMs, 1500);
  s.pedals = [];
  assert.doesNotThrow(() => createTimeline(s, t.settings));
});

test('overlapping voices keep both attacks without scoring an impossible physical key hold', () => {
  const s = score();
  s.performance!.events = [event('n', 60, 0, 900), event('n', 60, 500, 1000)];
  const t = createTimeline(s, { ...settingsFor(s), mode: 'bpm' });
  assert.equal(t.targets.length, 2);
  assert.equal(t.targets[0].endMs, 900);
  assert.equal(t.targets[0].releaseMs, undefined);
  assert.equal(t.targets[1].releaseMs, 1000);
  const engine = new PracticeEngine(t);
  [midi(1, 'on', 0), midi(2, 'off', 500), midi(3, 'on', 500), midi(4, 'off', 1000)].forEach((e) =>
    engine.input(e),
  );
  engine.clock(3000);
  const r = resultFor(t, engine.view(), 'Overlapping voices', 'complete', 3000);
  assert.equal(r.metrics.hits, 2);
  assert.deepEqual(
    r.r4!.key.map((k) => k.status),
    ['unavailable', 'correct'],
  );
});

for (const name of ['special-symbols', 'pedal-duration'])
  test(`captured native MPE ${name} remains playable in both grading modes`, () => {
    const json = readFileSync(
      new URL(
        `../../../tests/fixtures/pianist/practice/${name}-mpe-snapshot.json`,
        import.meta.url,
      ),
      'utf8',
    );
    const s = {
      ...decodeNativePracticeSnapshot(json),
      projectId: name,
      fingerprint: name,
    } as ScoreSnapshot;
    for (const mode of ['bpm', 'wait'] as const) {
      const t = createTimeline(s, { ...settingsFor(s), mode, tempoMode: 'score' });
      assert.equal(
        t.targets.length,
        new Set(s.performance!.events.map((n) => n.pitch + '/' + n.atMs)).size,
      );
      const engine = new PracticeEngine(t);
      let seq = 0;
      const events = t.targets
        .flatMap((n) => [
          midi(++seq, 'on', n.atMs, n.pitch),
          midi(++seq, 'off', n.releaseMs ?? n.endMs, n.pitch),
        ])
        .sort((a, b) => a.timestampMs - b.timestampMs || (a.kind === 'off' ? -1 : 1));
      events.forEach((e, i) => engine.input({ ...e, sequence: i + 1 }));
      engine.clock(t.durationMs + 30000);
      const r = resultFor(t, engine.view(), name, 'complete', t.durationMs + 30000);
      assert.equal(r.metrics.hits, t.targets.length);
      assert.equal(r.metrics.misses, 0);
      assert.equal(r.metrics.extras, 0);
    }
  });
