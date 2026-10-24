import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EngineBridge,
  decodePlaybackFrame,
  type NativeApi,
  type NativeModule,
} from '../../../packages/engine-bridge';
import {
  decodeNativePracticeSnapshot,
  decodeNativeScoreSemantics,
} from '../../../packages/score-contracts';
import {
  captureRendererSnapshotJson,
  type RendererNativeModule,
} from '../../../packages/exercise-renderer/native-snapshot';
import { nativeSnapshot, nativeSemantics } from './helpers/native-score';

const json = (value: unknown) => JSON.stringify(value);

test('native snapshot decoder preserves exported timing, order, velocity zero and full-page SVG verbatim', () => {
  const raw = nativeSnapshot(7);
  raw.anchors.push({ ...raw.anchors[0], id: 'continuation', tick: 960, tieBack: 'n' });
  raw.performed.push({ anchor: 'continuation', occurrence: 0, atMs: 1000, endMs: 1499.123456789 });
  raw.keyReleases.push({
    anchor: 'n',
    pitch: 60,
    velocity: 0,
    utick: 480,
    endUtick: 1439,
    atMs: 500,
    endMs: 1499.123456789,
  });
  raw.pedals.push({
    id: 0,
    partId: 'p',
    occurrence: 0,
    tick: 0,
    endTick: 1440,
    atMs: 0,
    endMs: 1500,
  });
  raw.tempos.push({ occurrence: 0, atMs: 350.123456, quarterBpm: 67.89 });
  raw.timeMap.push({ occurrence: 0, tick: 480, atMs: 500 });
  raw.cursorSegments.push({ measure: 0, tick: 0, endTick: 1920, x: -12.2, endX: 81.9 });
  raw.pages[0].svg = '<svg viewBox="-12 -5 300 600"><path d="M1 2 L3 4"/></svg>';
  raw.staves[0].instruments[0].tick = -1;
  const decoded = decodeNativePracticeSnapshot(json(raw), 7);
  assert.deepEqual(decoded, raw);
  assert.equal('projectId' in decoded, false);
  assert.equal('fingerprint' in decoded, false);
  const semantics = nativeSemantics(7);
  semantics.rests = [[0, 480, 0, 0]];
  semantics.keys = [[0, 0, -2]];
  semantics.slurs = [[0, 1440, 0, 0]];
  semantics.dynamics = [
    {
      tick: 0,
      track: 0,
      type: 12,
      text: '<sym>dynamicForte</sym>',
      velocity: 96,
      changeInVelocity: -47,
      velocityChangeTicks: 240,
      speed: 1,
      play: true,
    },
  ];
  assert.deepEqual(decodeNativeScoreSemantics(json(semantics), 7), semantics);
  assert.equal(decodeNativeScoreSemantics(json(semantics)).anchors[0].userVelocity, 0);
});

test('current native contracts reject missing facts, invalid nested values and unresolved identities', () => {
  const missing = [
    'staves',
    'measures',
    'anchors',
    'occurrences',
    'performed',
    'beats',
    'warnings',
    'cursorSegments',
    'timeMap',
    'tempos',
    'unsupported',
    'durationReference',
    'keyReleases',
    'pedals',
    'performance',
  ];
  for (const key of missing) {
    const s = nativeSnapshot();
    Reflect.deleteProperty(s, key);
    assert.throws(() => decodeNativePracticeSnapshot(json(s)), Error, key);
  }
  const cases: [string, (s: ReturnType<typeof nativeSnapshot>) => void][] = [
    [
      'instrument facts',
      (s) => {
        Reflect.deleteProperty(s.staves[0], 'instruments');
      },
    ],
    [
      'instrument program type',
      (s) => {
        Object.assign(s.staves[0].instruments[0], { programs: ['0'] });
      },
    ],
    [
      'beat unit',
      (s) => {
        Reflect.deleteProperty(s.beats[0], 'beatQuarter');
      },
    ],
    [
      'non-finite timing',
      (s) => {
        s.performed[0].atMs = NaN;
      },
    ],
    [
      'reversed timing',
      (s) => {
        s.performed[0].endMs = -1;
      },
    ],
    [
      'pitch',
      (s) => {
        s.anchors[0].pitch = 128;
      },
    ],
    [
      'staff reference',
      (s) => {
        s.anchors[0].staff = 2;
      },
    ],
    [
      'visual staff reference',
      (s) => {
        s.anchors[0].visualStaff = 2;
      },
    ],
    [
      'measure reference',
      (s) => {
        s.anchors[0].measure = 2;
      },
    ],
    [
      'page reference',
      (s) => {
        s.anchors[0].page = 2;
      },
    ],
    [
      'tie reference',
      (s) => {
        s.anchors[0].tieBack = 'missing';
      },
    ],
    [
      'performed reference',
      (s) => {
        s.performed[0].anchor = 'missing';
      },
    ],
    [
      'occurrence reference',
      (s) => {
        s.performed[0].occurrence = 2;
      },
    ],
    [
      'release reference',
      (s) => {
        s.keyReleases = [
          { anchor: 'missing', pitch: 60, utick: 0, endUtick: 480, atMs: 0, endMs: 500 },
        ];
      },
    ],
    [
      'pedal part',
      (s) => {
        s.pedals = [
          { id: 0, partId: 'missing', occurrence: 0, tick: 0, endTick: 480, atMs: 0, endMs: 500 },
        ];
      },
    ],
    [
      'duplicate identity',
      (s) => {
        s.anchors.push({ ...s.anchors[0] });
      },
    ],
    [
      'fractional tick',
      (s) => {
        s.anchors[0].tick = 0.25;
      },
    ],
    [
      'non-string expression kind',
      (s) => {
        s.unsupported = [{ kind: 'pause', measure: 0 }];
        Object.assign(s.unsupported[0], { kind: ['pause'] });
      },
    ],
  ];
  for (const [name, mutate] of cases) {
    const s = nativeSnapshot();
    mutate(s);
    assert.throws(() => decodeNativePracticeSnapshot(json(s)), Error, name);
  }
  assert.throws(() => decodeNativePracticeSnapshot(json(nativeSnapshot(2)), 3), /revision/);
  assert.throws(() => decodeNativePracticeSnapshot(json(nativeSemantics())), /pages/);
  assert.throws(() => decodeNativeScoreSemantics(json(nativeSnapshot())), /pages/);
  for (const field of ['rests', 'keys', 'slurs', 'dynamics']) {
    const s = nativeSemantics();
    Reflect.deleteProperty(s, field);
    assert.throws(() => decodeNativeScoreSemantics(json(s)));
  }
  for (const field of ['spelling', 'userVelocity']) {
    const s = nativeSemantics();
    Reflect.deleteProperty(s.anchors[0], field);
    assert.throws(() => decodeNativeScoreSemantics(json(s)));
  }
});

test('every JSON bridge callback defers malformed data until native cleanup and restores its previous callback', () => {
  for (const callback of [
    'onEditorPlayback',
    'onPracticePlayback',
    'onPracticePlaybackNotes',
    'onScoreSemantics',
    'onPreparedSemantics',
    'onPracticeSnapshot',
    'onPreparedSnapshot',
  ] as const) {
    for (const payload of ['null', '{broken JSON', '{}']) {
      let nativeReturned = false;
      const previous = () => {},
        Module: NativeModule = { [callback]: previous };
      const emit = () => {
        Module[callback]!(payload);
        nativeReturned = true;
        return 1;
      };
      const api = {
        Module,
        getEditorPlayback: emit,
        getPracticePlayback: emit,
        getPracticePlaybackNotes: emit,
        getScoreSemantics: emit,
        prepareProject: emit,
        getPracticeSnapshot: emit,
        preparePracticeSnapshot: emit,
      } as unknown as NativeApi;
      const bridge = new EngineBridge(api);
      const calls = {
        onEditorPlayback: () => bridge.playbackState(),
        onPracticePlayback: () => bridge.auditionState(),
        onPracticePlaybackNotes: () => bridge.auditionNotes(),
        onScoreSemantics: () => bridge.semantics(),
        onPreparedSemantics: () => bridge.semantics(Uint8Array.of(1)),
        onPracticeSnapshot: () => bridge.snapshot(),
        onPreparedSnapshot: () => bridge.preparedSnapshot(Uint8Array.of(1), 'test.mxl'),
      };
      assert.throws(calls[callback], Error, callback);
      assert.equal(nativeReturned, true, callback);
      assert.equal(Module[callback], previous, callback);
    }
  }
});

test('binary copy failures cannot interrupt native cleanup; serializing restores callbacks and rejects revision races', () => {
  for (const callback of ['onProjectPrepared', 'onProjectSerialized', 'onXmlExported'] as const) {
    let nativeReturned = false;
    const previous = () => {},
      Module: NativeModule = { [callback]: previous };
    // A detached WASM-style view throws while creating the independent byte copy.
    const buffer = new ArrayBuffer(2),
      bytes = new Uint8Array(buffer);
    structuredClone(buffer, { transfer: [buffer] });
    const emit = () => {
      Module[callback]!(bytes);
      nativeReturned = true;
      return 1;
    };
    const api = {
      Module,
      prepareProject: emit,
      serializeProject: emit,
      exportScore: emit,
    } as unknown as NativeApi;
    const bridge = new EngineBridge(api);
    const call =
      callback === 'onProjectPrepared'
        ? () => bridge.prepare(Uint8Array.of(1), 'a.mxl')
        : callback === 'onProjectSerialized'
          ? () => bridge.serialize()
          : () => bridge.musicXml();
    assert.throws(call);
    assert.equal(nativeReturned, true);
    assert.equal(Module[callback], previous);
  }
  const previous = () => {},
    Module: NativeModule = { onProjectSerialized: previous };
  const api = {
    Module,
    serializeProject: () => {
      Module.onProjectSerialized!(Uint8Array.of(1));
      bridge.revision++;
      return 1;
    },
  } as unknown as NativeApi;
  const bridge = new EngineBridge(api);
  assert.throws(() => bridge.serialize(), /thay đổi/);
  assert.equal(Module.onProjectSerialized, previous);
});

test('renderer raw capture always frees WASM input and restores callbacks before shared validation', () => {
  const previous = () => {};
  let returned = false,
    freed = false;
  const module: RendererNativeModule = {
    HEAPU8: new Uint8Array(64),
    _malloc: () => 8,
    _free: (ptr) => {
      assert.equal(ptr, 8);
      assert.equal(returned, true);
      freed = true;
    },
    ccall: () => {
      module.onPreparedSnapshot!('{invalid');
      returned = true;
      return 1;
    },
    onPreparedSnapshot: previous,
  };
  const raw = captureRendererSnapshotJson(module, Uint8Array.of(1, 2), 'temporary.mxl');
  assert.equal(freed, true);
  assert.equal(module.onPreparedSnapshot, previous);
  assert.throws(() => decodeNativePracticeSnapshot(raw));
  module.ccall = () => {
    throw Error('native failure');
  };
  assert.throws(
    () => captureRendererSnapshotJson(module, Uint8Array.of(1), 'fail.mxl'),
    /native failure/,
  );
  assert.equal(module.onPreparedSnapshot, previous);
  module.ccall = () => {
    module.onPreparedSnapshot!(json(nativeSnapshot()));
    return 1;
  };
  assert.deepEqual(
    decodeNativePracticeSnapshot(
      captureRendererSnapshotJson(module, Uint8Array.of(1), 'valid.mxl'),
    ),
    nativeSnapshot(),
  );
});

test('native playback runtime boundaries reject corrupt clocks/maps and retain exact valid output frames', () => {
  const playbackModule: NativeModule = {};
  const playbackBridge = new EngineBridge({
    Module: playbackModule,
    getEditorPlayback: () => {
      playbackModule.onEditorPlayback!(
        json({
          available: true,
          status: ['playing'],
          positionSeconds: 0,
          durationSeconds: 1,
          tempoMultiplier: 1,
        }),
      );
      return 1;
    },
  } as unknown as NativeApi);
  assert.throws(() => playbackBridge.playbackState(), /status/);
  const frame = {
    epoch: 2,
    sequenceId: 3,
    tempoMultiplier: 0.5,
    positionSeconds: 10.123456789,
    status: 2 as const,
    contextTime: 12.3,
    outputContextTime: 12.29,
  };
  assert.equal(decodePlaybackFrame(frame), frame);
  assert.equal(decodePlaybackFrame(null), null);
  for (const value of [
    { ...frame, positionSeconds: Infinity },
    { ...frame, tempoMultiplier: 0 },
    { ...frame, status: '2' },
    { ...frame, epoch: 1.5 },
    {},
  ])
    assert.throws(() => decodePlaybackFrame(value));
  const driver = {
    resume: async () => {},
    preparePreview: async () => {},
    previewMidi() {},
    stopPreview() {},
    playbackFrame: () => frame,
  };
  const bridge = new EngineBridge({ Module: { driver } } as unknown as NativeApi);
  assert.equal(bridge.practiceAudio(), driver);
  Reflect.deleteProperty(driver, 'preparePreview');
  assert.throws(() => bridge.practiceAudio(), /preparePreview/);
  const Module: NativeModule = {},
    api = {
      Module,
      getPracticePlaybackNotes: () => {
        Module.onPracticePlaybackNotes!(
          json({
            source: 'musescore-mpe',
            revision: 1,
            events: [
              {
                anchors: ['n'],
                pitch: 60,
                atMs: 0,
                endMs: 500,
                spans: [{ anchor: 'missing', occurrence: 0, atMs: 0, endMs: 500 }],
              },
            ],
            timeMap: [
              { referenceMs: 0, playbackMs: 0 },
              { referenceMs: 500, playbackMs: 500 },
            ],
          }),
        );
        return 1;
      },
    } as unknown as NativeApi;
  assert.throws(() => new EngineBridge(api).auditionNotes(), /reference/);
});
