import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceAudioProvider } from '../src/application/practice-audio';
import { setSoundMode } from '../src/platform/audio-output';
import { practicePiano } from '../src/platform/sample-piano';

test('cold light-piano calibration needs no MuseScore audio driver', async () => {
  setSoundMode('piano');
  const provider = practiceAudioProvider(async () => {throw Error('Must not load MuseScore for light piano');});
  assert.equal(await provider(), practicePiano);
});

test('MuseScore provider waits for audio processing before requesting its driver', async () => {
  const oldContext = globalThis.AudioContext;
  (globalThis as any).AudioContext = class {state = 'running'; resume = async () => {};};
  setSoundMode('musescore');
  const calls: string[] = [], driver = {setMuted: (value: boolean) => calls.push('muted:' + value)};
  const bridge: any = {api: {Module: {}, startAudioProcessing: async () => {calls.push('start'); bridge.api.Module.driver = driver;}}, practiceAudio: () => {assert.equal(bridge.api.Module.driver, driver); calls.push('driver'); return driver;}};
  try {
    assert.equal(await practiceAudioProvider(async () => bridge)(), driver);
    assert.deepEqual(calls, ['start', 'muted:false', 'driver']);
  } finally {setSoundMode('piano'); (globalThis as any).AudioContext = oldContext;}
});
