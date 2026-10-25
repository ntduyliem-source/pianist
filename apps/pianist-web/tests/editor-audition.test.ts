import test from 'node:test';
import assert from 'node:assert/strict';
import type { EngineBridge, PlaybackTimePoint } from '../../../packages/engine-bridge';
import type { AuditionState } from '../src/practice/native-audition';
import { EditorAudition, bindEditorPlayback, editorAudition } from '../src/application/editor-audition';
import { setSoundMode } from '../src/platform/audio-output';
function fixture(speed: number) {
  const oldAudio = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: class { async resume() {} } });
  const map = (s: number): PlaybackTimePoint[] => [
    { referenceMs: 0, playbackMs: 0 },
    { referenceMs: 2000, playbackMs: 2000 / s },
    { referenceMs: 3000, playbackMs: 2000 / s + 1000 },
    { referenceMs: 6000, playbackMs: 5000 / s + 1000 },
  ];
  const cursor: [number, boolean][] = [], starts: number[] = [], seeks: number[] = [];
  let tempo = speed, notes = { events: [], midi: [], revision: 1, source: 'musescore-mpe' as const, timeMap: map(speed) };
  const bridge = {
    revision: 1, practiceActive: false,
    playbackState: () => ({ tempoMultiplier: tempo }),
    samplePlayback: (s: number) => { notes = { ...notes, timeMap: map(s) }; return notes; },
    semantics: () => { throw Error('Tempo-dependent semantics cannot define a reference range'); },
    api: { sampleEditorPosition: (seconds: number, playing: boolean) => cursor.push([seconds, playing]) },
  } as unknown as EngineBridge;
  let preview: any, referenceRange: any;
  const state = (positionMs: number, status: AuditionState['status'] = 'playing'): AuditionState => ({
    available: true, status, positionMs, positionSeconds: positionMs / 1000, durationSeconds: 6,
    elapsedMs: 0, sounding: status === 'playing', notes: [], timeMap: notes.timeMap,
    tempoMultiplier: tempo, preparing: false, error: '', clockEpoch: 0, notesRevision: 1,
  });
  const player = new EditorAudition((_b, range) => {
    referenceRange = range;
    preview = {
      range, onChange() {}, onError() {},
      async start(s: number) { starts.push(s); preview.onChange(state(0)); },
      async toggle() { preview.onChange(state(3500)); },
      seek(ms: number) { seeks.push(ms); preview.onChange(state(ms, 'paused')); },
      speed(s: number) { tempo = s; bridge.samplePlayback(s); preview.onChange(state(3500)); },
      loop() {}, pause() {}, stop() {},
    };
    return preview;
  });
  return { bridge, player, cursor, starts, seeks, state, preview: () => preview, range: () => referenceRange,
    restore: () => { player.stop(); if (oldAudio) Object.defineProperty(globalThis, 'AudioContext', oldAudio); else Reflect.deleteProperty(globalThis, 'AudioContext'); },
  };
}

test('editor sample range, full duration, seek and cursor share native mapping at 10/50/100/200/300 percent', async () => {
  for (const speed of [.1, .5, 1, 2, 3]) {
    const f = fixture(speed);
    try {
      await f.player.toggle(f.bridge);
      assert.deepEqual(f.range(), { startMs: 0, endMs: 6000 });
      assert.deepEqual(f.starts, [speed]);
      assert.equal(f.player.snapshot()?.durationSeconds, (5000 / speed + 1000) / 1000);
      f.preview().onChange(f.state(3500));
      const performedSeconds = (2500 / speed + 1000) / 1000;
      assert(Math.abs(f.player.snapshot()!.positionSeconds - performedSeconds) < 1e-9);
      assert(Math.abs(f.cursor.at(-1)![0] - performedSeconds) < 1e-9); assert.equal(f.cursor.at(-1)![1], true);
      f.player.seek(performedSeconds, f.bridge);
      assert(Math.abs(f.seeks.at(-1)! - 3500) < 1e-9);
      f.player.speed(2);
      assert.deepEqual(f.cursor.at(-1), [2.25, true]);
      assert.equal(f.player.snapshot()?.durationSeconds, 3.5);
      f.bridge.practiceActive = true;
      f.player.stop();
      assert.deepEqual(f.cursor.at(-1), [0, false]);
    } finally { f.restore(); }
  }
});

test('Qt play-from-selection seeks in performed seconds before the sample is loaded', async () => {
  const f = fixture(.5);
  try {
    f.player.seek(6, f.bridge);
    await f.player.toggle(f.bridge);
    assert.equal(f.seeks[0], 3500);
    assert.deepEqual(f.starts, [.5]);
  } finally { f.restore(); }
});

test('native toolbar Pause/Stop share the sample owner and late commands are ignored after detach', async () => {
  setSoundMode('piano');
  const output: [string, number][] = [], positions: [number, boolean][] = [];
  const bridge = { practiceActive: false, api: { Module: {}, editorPlayback: (command: string, value: number) => { output.push([command, value]); return 1; }, sampleEditorPosition: (seconds: number, playing: boolean) => positions.push([seconds, playing]) }, playbackState: () => ({ available: false }) } as unknown as EngineBridge;
  const pause = editorAudition.pause; let pauses = 0;
  editorAudition.pause = () => { pauses++; };
  const errors: unknown[] = [];
  const detach = bindEditorPlayback(bridge, e => errors.push(e));
  try {
    assert.deepEqual(output, [['output', 1]]);
    bridge.api.Module.onEditorPlaybackCommand!('pause', 0);
    await Promise.resolve(); assert.equal(pauses, 1);
    bridge.api.Module.onEditorPlaybackCommand!('stop', 0);
    await Promise.resolve();
    assert.equal(output.filter(([command]) => command === 'stop').length, 0);
    assert.deepEqual(positions.at(-1), [0, false]);
    bridge.api.Module.onEditorPlaybackCommand!('pause', 0);
    detach(); await Promise.resolve();
    assert.equal(pauses, 1);
    assert.deepEqual(output.at(-1), ['output', 0]);
    assert.deepEqual(errors, []);
  } finally { editorAudition.pause = pause; }
});

