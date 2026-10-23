import { nativeSemantics } from './helpers/native-score';
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAbcFidelity, exportAbc } from '../../../packages/score-formats/export';
import { EngineBridge, type NativeApi } from '../../../packages/engine-bridge';
import { scoreFixture } from './helpers/fixtures-v2';
import { CONVERTER_VERSION, type FormatJob } from '../../../packages/score-formats/model';
import type { ScoreConverter } from '../../../packages/score-formats';

test('ABC fidelity rejects exact tick, voice, pitch, tie, repeat, BPM, native release and pedal changes', () => {
  const source = scoreFixture();
  source.anchors.push({ ...source.anchors[0], id: 'n2', tick: 960 });
  source.staves.push({ ...source.staves[0], id: 1 });
  source.pedals = [
    {
      id: 0,
      partId: source.staves[0].partId,
      occurrence: 0,
      tick: 0,
      endTick: 480,
      atMs: 0,
      endMs: 500,
    },
  ];
  source.keyReleases = [
    { anchor: source.anchors[0].id, pitch: 60, utick: 0, endUtick: 456, atMs: 0, endMs: 475 },
  ];
  for (const mutate of [
    (s: typeof source) => {
      s.anchors[0].pitch++;
    },
    (s: typeof source) => {
      s.anchors[0].durationTicks++;
    },
    (s: typeof source) => {
      s.anchors[0].voice++;
    },
    (s: typeof source) => {
      s.anchors[0].tieBack = s.anchors[1].id;
    },
    (s: typeof source) => {
      s.occurrences[0].measure++;
    },
    (s: typeof source) => {
      s.beats[0].atMs += 0.001;
    },
    (s: typeof source) => {
      s.baseQuarterBpm++;
    },
    (s: typeof source) => {
      s.keyReleases![0].endMs += 0.001;
    },
    (s: typeof source) => {
      s.pedals![0].endTick++;
    },
    (s: typeof source) => {
      s.staves[1].partId = 'other-part';
    },
  ]) {
    const altered = structuredClone(source);
    mutate(altered);
    assert.throws(() => assertAbcFidelity(source, altered), /Chưa xuất file/);
  }
  const layout = structuredClone(source);
  layout.title = 'changed layout';
  layout.revision++;
  layout.anchors.forEach((n) => {
    n.box.x += 100;
    n.page++;
  });
  layout.keyReleases![0].endMs += 1e-7;
  assert.doesNotThrow(() => assertAbcFidelity(source, layout));
});

function setup() {
  const snapshot = nativeSemantics(),
    Module: any = {},
    jobs: FormatJob[] = [],
    xml = new TextEncoder().encode('<score-partwise/>');
  let captured = 0;
  snapshot.anchors.forEach((n) => {
    n.userVelocity = 0;
  });
  const api = {
    Module,
    exportScore() {
      Module.onXmlExported(xml);
      return 1;
    },
    getScoreSemantics() {
      Module.onScoreSemantics(JSON.stringify(snapshot));
      return 1;
    },
    prepareProject() {
      captured++;
      Module.onPreparedSemantics(JSON.stringify(snapshot));
      return 1;
    },
  } as unknown as NativeApi;
  const bridge = new EngineBridge(api);
  const converter: ScoreConverter = {
    run: async (job) => {
      jobs.push(job);
      return {
        ok: true,
        text: job.operation === 'xml-to-abc' ? 'X:1\nT:Latest\nK:C\nC4|' : '<score-partwise/>',
        diagnostics: [],
        converter: CONVERTER_VERSION,
      };
    },
  };
  return { bridge, converter, jobs, snapshot, captured: () => captured };
}
test('ABC export captures current native XML then reimports through upstream before checking temporary native score', async () => {
  const { bridge, converter, jobs, captured } = setup();
  const result = await exportAbc(bridge, converter);
  assert.match(result.text, /Latest/);
  assert.deepEqual(
    jobs.map((j) => j.operation),
    ['xml-to-abc', 'abc-to-xml'],
  );
  assert.equal(jobs[0].text, '<score-partwise/>');
  assert.equal(captured(), 1);
});
test('ABC export rejects a revision race, cancellation, unsupported expression and silent conversion loss', async () => {
  const a = setup(),
    run = a.converter.run;
  a.converter.run = async (...args) => {
    a.bridge.revision++;
    return run(...args);
  };
  await assert.rejects(exportAbc(a.bridge, a.converter), /revision|thay đổi/);
  const b = setup(),
    abort = new AbortController();
  abort.abort();
  await assert.rejects(exportAbc(b.bridge, b.converter, abort.signal), { name: 'AbortError' });
  assert.equal(b.jobs.length, 0);
  const c = setup();
  c.snapshot.warnings = ['grace'];
  await assert.rejects(exportAbc(c.bridge, c.converter), /chưa được kiểm chứng/);
  assert.equal(c.jobs.length, 0);
  const d = setup();
  d.bridge.api.prepareProject = () => {
    const altered = structuredClone(d.snapshot);
    altered.anchors[0].pitch++;
    d.bridge.api.Module.onPreparedSemantics!(JSON.stringify(altered));
    return 1;
  };
  await assert.rejects(exportAbc(d.bridge, d.converter), /Chưa xuất file/);
});

test('fidelity includes written rests, key changes, slur endpoints and pitch spelling', () => {
  const source = Object.assign(scoreFixture(), {
    rests: [[0, 480, 0, 0]],
    keys: [[0, 0, 0]],
    slurs: [[0, 480, 0, 0]],
  });
  Object.assign(source.anchors[0], { spelling: 14 });
  for (const key of ['rests', 'keys', 'slurs'] as const) {
    const changed = structuredClone(source);
    changed[key][0][0]++;
    assert.throws(() => assertAbcFidelity(source, changed), /Chưa xuất file/);
  }
  const changed = structuredClone(source);
  Object.assign(changed.anchors[0], { spelling: 15 });
  assert.throws(() => assertAbcFidelity(source, changed), /Chưa xuất file/);
});

test('ABC fidelity rejects lost note velocity and dynamic expression, preserving identical native dynamics', () => {
  const source = scoreFixture();
  source.anchors[0].userVelocity = 27;
  source.dynamics = [
    {
      tick: 0,
      track: 0,
      type: 12,
      text: '<sym>dynamicForte</sym><sym>dynamicPiano</sym>',
      velocity: 96,
      changeInVelocity: -47,
      velocityChangeTicks: 240,
      speed: 1,
      play: true,
    },
  ];
  assert.doesNotThrow(() => assertAbcFidelity(source, structuredClone(source)));
  const noVelocity = structuredClone(source);
  noVelocity.anchors[0].userVelocity = 0;
  assert.throws(() => assertAbcFidelity(source, noVelocity), /cường độ từng nốt/);
  const noFp = structuredClone(source);
  noFp.dynamics = [];
  assert.throws(() => assertAbcFidelity(source, noFp), /sắc thái/);
  for (const mutate of [
    (s: typeof source) => {
      s.dynamics![0].velocity--;
    },
    (s: typeof source) => {
      s.dynamics![0].changeInVelocity++;
    },
    (s: typeof source) => {
      s.dynamics![0].velocityChangeTicks++;
    },
    (s: typeof source) => {
      s.dynamics![0].track++;
    },
    (s: typeof source) => {
      s.dynamics![0].play = false;
    },
  ]) {
    const changed = structuredClone(source);
    mutate(changed);
    assert.throws(() => assertAbcFidelity(source, changed), /sắc thái/);
  }
});

test('ABC export fails closed if either native engine omits dynamics or explicit zero velocities', async () => {
  for (const field of ['dynamics', 'userVelocity'] as const) {
    for (const side of ['before', 'after']) {
      const s = setup();
      const omit = (value: typeof s.snapshot) => {
        if (field === 'dynamics') delete (value as any).dynamics;
        else Reflect.deleteProperty(value.anchors[0], 'userVelocity');
      };
      if (side === 'before') omit(s.snapshot);
      else
        s.bridge.api.prepareProject = () => {
          const changed = structuredClone(s.snapshot);
          omit(changed);
          s.bridge.api.Module.onPreparedSemantics!(JSON.stringify(changed));
          return 1;
        };
      await assert.rejects(exportAbc(s.bridge, s.converter), /Snapshot MuseScore không hợp lệ/);
      if (side === 'before') assert.equal(s.jobs.length, 0);
    }
  }
});
