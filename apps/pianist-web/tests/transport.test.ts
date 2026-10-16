import test from 'node:test';
import assert from 'node:assert/strict';
import {PracticeTransport} from '../src/platform/transport';
import type {Plan} from '../../../packages/score-contracts/index';

test('guide audio follows pitch/onset, cancels on pause and resumes only the remaining sustain', async () => {
  const nodes: {frequency: {value: number}; started?: number; stops: (number | undefined)[]; type: string; connect(node: any): any; start(at: number): void; stop(at?: number): void}[] = [];
  const context = {currentTime: 10, state: 'running', destination: {}, async resume() {},
    createGain: () => ({gain: {setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}}, connect() {}, disconnect() {}}),
    createOscillator: () => {const node = {frequency: {value: 0}, type: '', started: undefined as number | undefined, stops: [] as (number | undefined)[],
      connect(gain: any) {return gain;}, start(at: number) {this.started = at;}, stop(at?: number) {this.stops.push(at);}}; nodes.push(node); return node;}};
  const transport = new PracticeTransport(); transport.context = context as unknown as AudioContext;
  const plan = {config: {mode: 'bpm', bpm: 60, countIn: 0, metronome: false}, accompaniment: [
    {pitch: 48, atMs: 0, endMs: 1000}, {pitch: 62, atMs: 2000, endMs: 2500},
  ]} as Plan;
  await transport.start(plan); assert.equal(nodes.length, 1);
  assert.ok(Math.abs(nodes[0].frequency.value - 130.81278265) < .0001); assert.equal(nodes[0].started, 10.15);
  context.currentTime = 12; transport.schedule(); assert.equal(nodes.length, 2); assert.equal(nodes[1].started, 12.15);
  transport.stop(); assert.ok(nodes.every(n => n.stops.at(-1) === undefined));
  context.currentTime = 20; await transport.start(plan, 500);
  assert.equal(nodes.length, 3); assert.ok(Math.abs(nodes[2].stops[0]! - 20.83) < .0001);
  transport.stop();
  transport.tone(60, true); context.state = 'suspended'; transport.stop();
  assert.equal(nodes.at(-1)!.stops.at(-1), undefined, 'suspended context cannot retain a sounding virtual key');
});
