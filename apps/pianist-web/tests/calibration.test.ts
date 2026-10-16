import test from 'node:test';
import assert from 'node:assert/strict';
import {Calibration} from '../src/platform/calibration';
import {PracticeTransport} from '../src/platform/transport';
import type {InputEvent, Plan, SessionConfig} from '../../../packages/score-contracts/index';

const config = {deviceId: 'piano', inputSource: 'midi', deliveryMs: 120} as SessionConfig;
async function browser(action: () => Promise<void>) {
  const previous = {window: (globalThis as any).window, document: (globalThis as any).document};
  Object.assign(globalThis, {window: Object.assign(new EventTarget(), {setInterval}), document: Object.assign(new EventTarget(), {hidden: false})});
  try {await action();} finally {Object.assign(globalThis, previous);}
}
test('canceling calibration while audio is starting cannot attach MIDI or restart the clock', () => browser(async () => {
  const calibration = new Calibration(); let resolve!: () => void, subscriptions = 0;
  calibration.transport.start = () => new Promise<void>(done => {resolve = done;});
  const starting = calibration.start(config, () => {++subscriptions; return () => {};});
  calibration.stop(); resolve(); await starting;
  assert.equal(calibration.running, false); assert.equal(subscriptions, 0); calibration.dispose();
}));

test('calibration rejects late delivery and duplicate clicks, and blur unsubscribes input', () => browser(async () => {
  const calibration = new Calibration(); let input!: (event: InputEvent) => void, unsubscribed = false;
  calibration.transport.start = async () => {}; calibration.transport.relative = time => time;
  await calibration.start(config, fn => {input = fn; return () => {unsubscribed = true;};});
  const event = {type: 'on', source: 'midi', deviceId: 'piano', atMs: 20, receivedMs: 150} as InputEvent;
  input(event); assert.equal(calibration.samples.length, 0);
  for (let i = 0; i < 8; ++i) input({...event, atMs: i * 750 + 25, receivedMs: i * 750 + 30});
  input({...event, atMs: 25, receivedMs: 30});
  assert.equal(calibration.samples.length, 8); assert.equal(calibration.median, 25); assert.equal(calibration.spread, 0);
  calibration.samples = [0, 10, 20, 30, 40, 50, 60, 70]; assert.equal(calibration.median, 35);
  window.dispatchEvent(new Event('blur')); assert.equal(calibration.running, false); assert.equal(unsubscribed, true); calibration.dispose();
}));

test('stop during audio resume cannot schedule a stale accompaniment', async () => {
  const transport = new PracticeTransport(); let resolve!: (value: AudioContext) => void;
  const context = {currentTime: 10, createOscillator: () => {throw Error('Canceled audio must stay silent');}} as unknown as AudioContext;
  transport.context = context;
  transport.audio = () => new Promise<AudioContext>(done => {resolve = done;});
  const starting = transport.start({config: {bpm: 60, countIn: 0, mode: 'bpm'}, accompaniment: [{atMs: 0, endMs: 500, pitch: 60}]} as Plan);
  transport.stop(); resolve(context); await starting;
  assert.doesNotThrow(() => transport.schedule());
});
