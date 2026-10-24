import test from 'node:test';
import assert from 'node:assert/strict';
import { auditionBatches, chaseMidi } from '../src/practice/sample-audition';
import { bounded } from '../src/platform/audio-output';
import {
  EngineBridge,
  type NativeApi,
  type SampleMidiEvent,
} from '../../../packages/engine-bridge';
const e = (
  atMs: number,
  opcode: number,
  data1: number,
  data2: number,
  channel = 0,
): SampleMidiEvent => ({ atMs, opcode, data1, data2, channel });

test('seeking restores sustained releases, held notes and independent pedal channels', () => {
  const events = [
    e(0, 11, 64, 127),
    e(1, 9, 60, 90),
    e(2, 8, 60, 0),
    e(3, 9, 64, 80),
    e(4, 9, 60, 70, 1),
    e(5, 8, 60, 0, 1),
  ];
  assert.deepEqual(
    chaseMidi(events, 6).map((n) => [n.channel, n.opcode, n.data1, n.data2]),
    [
      [0, 11, 64, 127],
      [0, 9, 60, 90],
      [0, 8, 60, 0],
      [0, 9, 64, 80],
    ],
  );
  assert.deepEqual(
    chaseMidi([...events, e(7, 11, 64, 0)], 8).map((n) => [n.opcode, n.data1, n.data2]),
    [
      [11, 64, 0],
      [9, 64, 80],
    ],
  );
  assert.equal(
    chaseMidi(events, 1).filter((n) => n.opcode === 9).length,
    0,
    'the exact boundary is scheduled once, not chased',
  );
});

test('native sample decoder accepts missing glyphs but rejects malformed MIDI boundaries', () => {
  const Module: NativeApi['Module'] = {};
  const data = {
    source: 'musescore-mpe',
    revision: 1,
    events: [{ anchors: [], spans: [], pitch: 60, atMs: 10, endMs: 100 }],
    timeMap: [
      { referenceMs: 0, playbackMs: 0 },
      { referenceMs: 1000, playbackMs: 2000 },
    ],
    midi: [e(20, 9, 60, 100), e(100, 8, 60, 0)],
  };
  const api = {
    Module,
    getSamplePlayback: () => {
      Module.onSamplePlayback!(JSON.stringify(data));
      return 1;
    },
  } as unknown as NativeApi;
  const bridge = new EngineBridge(api);
  assert.equal(
    bridge.samplePlayback(0.5).midi[0].atMs,
    20,
    'native tempo output is never multiplied in JS',
  );
  data.midi[0].data1 = 128;
  assert.throws(() => bridge.samplePlayback(1), /không hợp lệ/);
});

test('a never-resolving loader times out; cancellation ignores late completion', async () => {
  await assert.rejects(bounded(new Promise(() => {}), 5, 'retry same song'), /retry same song/);
  const abort = new AbortController();
  let resolve!: (v: number) => void;
  const pending = bounded(new Promise<number>((r) => (resolve = r)), 1000, 'timeout', abort.signal);
  abort.abort();
  resolve(1);
  await assert.rejects(pending, { name: 'AbortError' });
});

test('seeking into a loop restores the seek state once and keeps the source event at that time', () => {
  const events = [e(0, 9, 60, 90), e(100, 9, 64, 90), e(200, 8, 60, 0)];
  const batches = auditionBatches(events, 0, 300, 100, true);
  assert.deepEqual(batches.get(0)?.chase, []);
  assert.deepEqual(
    batches.get(100)?.initialChase?.map((e) => e.data1),
    [60],
  );
  assert.equal(batches.get(100)?.chase, undefined);
  assert.equal(batches.get(100)?.events[0].data1, 64);
  assert.equal(batches.has(300), false);
});
