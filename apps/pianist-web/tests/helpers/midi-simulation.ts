import assert from 'node:assert/strict';
import {Worker as NodeWorker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {MidiRouter} from '../../src/platform/midi';
import {PracticeSession} from '../../src/practice/session';
import {ALGORITHM_VERSION, type Attack, type Plan, type SessionConfig} from '../../../../packages/score-contracts/index';

// Only the browser/device boundary is simulated. The router, session, transport,
// clock conversion, worker entry point, matcher and result builder are production code.
export class PracticeWorkerAdapter {
  static instances: PracticeWorkerAdapter[] = [];
  onmessage?: (event: {data: any}) => void;
  onerror?: (error: Error) => void;
  readonly responses: any[] = [];
  private worker: NodeWorker;
  private fenceId = 0;
  private fences = new Map<number, {resolve(): void; reject(error: Error): void}>();
  private failure?: Error;
  private termination?: Promise<number>;
  constructor(url: URL) {
    this.worker = new NodeWorker(`const {parentPort, workerData} = require('node:worker_threads');
      require('tsx/cjs/api').register();
      global.self = {postMessage: data => parentPort.postMessage(data)};
      require(workerData);
      parentPort.on('message', data => {
        if (data.testFence !== undefined) parentPort.postMessage({testFence: data.testFence});
        else self.onmessage({data});
      });`, {eval: true, workerData: fileURLToPath(url)});
    this.worker.on('message', data => {
      if (data.testFence !== undefined) {this.fences.get(data.testFence)?.resolve(); return;}
      this.responses.push(data); this.onmessage?.({data});
    });
    this.worker.on('error', error => {
      this.failure = error; this.fences.forEach(fence => fence.reject(error)); this.onerror?.(error);
    });
    PracticeWorkerAdapter.instances.push(this);
  }
  postMessage(data: unknown): void {this.worker.postMessage(data);}
  async flush(): Promise<void> {
    if (this.failure) throw this.failure;
    const id = ++this.fenceId;
    // A fence acknowledges message processing, including ticks with no progress.
    // It never advances time or calls the matcher on the test's behalf.
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {clearTimeout(timer); this.fences.delete(id);};
      const timer = setTimeout(() => {cleanup(); reject(Error('Practice worker fence timed out'));}, 5000);
      this.fences.set(id, {resolve: () => {cleanup(); resolve();}, reject: error => {cleanup(); reject(error);}});
      this.postMessage({testFence: id});
    });
  }
  terminate(): Promise<number> {return this.termination ??= this.worker.terminate();}
}

class MidiPort {
  readonly name = 'Simulated piano'; state = 'connected'; opens = 0; closes = 0;
  onmidimessage: ((event: {data: Uint8Array; timeStamp: number}) => void) | null = null;
  constructor(readonly id: string) {}
  async open() {++this.opens; return this;}
  async close() {++this.closes; return this;}
  emit(bytes: number[], timeStamp: number): void {
    if (this.state === 'connected') this.onmidimessage?.({data: new Uint8Array(bytes), timeStamp});
  }
}

export function midiPlan(notes: [atMs: number, pitch: number, endMs?: number][], overrides: Partial<SessionConfig> = {}): Plan {
  const config: SessionConfig = {mode: 'bpm', bpm: 60, beatQuarter: 1, countIn: 0, metronome: false,
    fromMeasure: 0, toMeasure: 0, hand: 'both', roles: {0: 'right', 1: 'left'}, voices: [0, 1, 2, 3],
    loops: 1, offsetMs: 0, perfectMs: 50, goodMs: 120, windowMs: 250, deliveryMs: 120,
    inputSource: 'midi', deviceId: 'simulated-piano', algorithmVersion: ALGORITHM_VERSION, ...overrides};
  const targets: Attack[] = notes.map(([atMs, pitch, endMs = atMs + 100], i) => ({id: String(i), pitch, atMs, endMs,
    anchors: [String(i)], roles: ['right'], measure: 0, occurrence: 0, loop: 0}));
  const groups: Plan['groups'] = [];
  for (const target of targets) {
    let group = groups.find(g => g.atMs === target.atMs);
    if (!group) {group = {atMs: target.atMs, endMs: target.endMs, targets: []}; groups.push(group);}
    group.targets.push(target); group.endMs = Math.max(group.endMs, target.endMs);
  }
  const durationMs = Math.max(...targets.map(t => t.endMs));
  return {schemaVersion: 1, projectId: 'midi-simulation', revision: 1, fingerprint: 'synthetic-score', config, targets, groups,
    beats: [], durationMs, loops: [{index: 0, startMs: 0, endMs: durationMs}],
    visits: [{measure: 0, occurrence: 0, loop: 0, pass: 0, startMs: 0, endMs: durationMs}]};
}

export class MidiSimulation {
  now = 10000;
  readonly midi = new MidiRouter();
  readonly port = new MidiPort('simulated-piano');
  readonly otherPort = new MidiPort('unselected-piano');
  readonly access = {inputs: new Map([[this.port.id, this.port]]), onstatechange: () => {}};
  readonly session: PracticeSession;
  private restorers: (() => void)[] = [];
  private timers = new Map<number, {callback: () => void; period: number; next: number}>();
  private timerId = 0;
  private workers: PracticeWorkerAdapter[] = [];
  constructor(readonly plan: Plan, readonly timerPeriod?: number) {
    const replace = (target: object, key: PropertyKey, value: unknown) => {
      const previous = Object.getOwnPropertyDescriptor(target, key);
      Object.defineProperty(target, key, {value, configurable: true, writable: true});
      this.restorers.push(() => {if (previous) Object.defineProperty(target, key, previous); else Reflect.deleteProperty(target, key);});
    };
    replace(performance, 'now', () => this.now);
    replace(globalThis, 'Worker', PracticeWorkerAdapter);
    replace(globalThis, 'isSecureContext', true);
    replace(navigator, 'requestMIDIAccess', async (options: {sysex: boolean}) => {assert.equal(options.sysex, false); return this.access;});
    replace(globalThis, 'window', {setInterval: (callback: () => void, period: number) => {
      const id = ++this.timerId, actualPeriod = this.timerPeriod ?? period;
      this.timers.set(id, {callback, period: actualPeriod, next: this.now + actualPeriod}); return id;
    }});
    replace(globalThis, 'clearInterval', (id: number) => this.timers.delete(id));
    const simulation = this;
    const audioNode = () => ({frequency: {value: 0}, gain: {value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {}},
      connect(node: unknown) {return node;}, disconnect() {}, start() {}, stop() {}});
    replace(globalThis, 'AudioContext', class {
      state = 'running'; baseLatency = 0; outputLatency = 0; destination = {}; onstatechange?: () => void;
      get currentTime() {return simulation.now / 1000;}
      getOutputTimestamp() {return {contextTime: this.currentTime, performanceTime: simulation.now};}
      async resume() {this.state = 'running';} async close() {this.state = 'closed';}
      createOscillator = audioNode; createGain = audioNode;
    });
    this.session = new PracticeSession(plan, 'Simulated MIDI acceptance', () => this.midi.deviceId === plan.config.deviceId);
    this.midi.onInput = event => this.session.input(event);
    // These callbacks mirror the workspace's disconnect/reset wiring.
    this.midi.onDisconnect = () => this.session.pause('Simulated MIDI disconnect', true);
    this.midi.onReset = () => this.session.pause('Simulated MIDI channel reset', true);
  }
  get worker(): PracticeWorkerAdapter {return this.workers[0];}
  async start(): Promise<void> {
    await this.midi.connect();
    const previous = PracticeWorkerAdapter.instances.length;
    await this.session.start(); this.workers = PracticeWorkerAdapter.instances.slice(previous);
    await this.flush();
  }
  async flush(): Promise<void> {
    // A progress callback can itself post pause to the worker. Drain that too.
    await this.worker.flush(); await this.worker.flush();
  }
  async advance(ms: number): Promise<void> {
    assert.ok(ms >= -.000001, `Simulation cannot move backwards: ${ms}`);
    const end = this.now + Math.max(0, ms);
    while (true) {
      const due = [...this.timers.values()].sort((a, b) => a.next - b.next)[0];
      if (!due || due.next > end) break;
      this.now = due.next; due.next += due.period; due.callback(); await this.flush();
    }
    this.now = end;
  }
  async go(atMs: number): Promise<void> {await this.advance(atMs - this.session.transport.position());}
  async send(atMs: number, bytes: number[], deliveryMs = 0, legacyTimestamp = false): Promise<void> {
    await this.go(atMs + deliveryMs);
    this.port.emit(bytes, this.now - deliveryMs + (legacyTimestamp ? performance.timeOrigin : 0)); await this.flush();
  }
  async hit(atMs: number, pitch: number, deliveryMs = 0, channel = 0): Promise<void> {
    await this.send(atMs, [0x90 | channel, pitch, 90], deliveryMs);
    await this.send(atMs + 20, [0x90 | channel, pitch, 0], deliveryMs);
  }
  async disconnect(): Promise<void> {this.port.state = 'disconnected'; this.access.onstatechange(); await this.flush();}
  async reconnect(): Promise<void> {
    this.port.state = 'connected'; this.access.onstatechange(); await this.midi.connect(false);
    assert.equal(this.midi.deviceId, 'virtual', 'reconnection requires an explicit port selection');
    await this.midi.select(this.port.id); await this.session.resume(); await this.flush();
  }
  async complete() {
    await this.go(this.plan.durationMs + this.plan.config.windowMs + this.plan.config.deliveryMs + Math.max(0, this.plan.config.offsetMs) + 200);
    assert.equal(this.session.status, 'finished'); return this.session.finish();
  }
  async dispose(): Promise<void> {
    this.session.dispose(); await Promise.all(this.workers.map(worker => worker.terminate()));
    this.restorers.reverse().forEach(restore => restore());
    PracticeWorkerAdapter.instances = PracticeWorkerAdapter.instances.filter(worker => !this.workers.includes(worker));
  }
}

export async function simulate(plan: Plan, run: (simulation: MidiSimulation) => Promise<void>, timerPeriod?: number): Promise<void> {
  const simulation = new MidiSimulation(plan, timerPeriod);
  try {await simulation.start(); await run(simulation);} finally {await simulation.dispose();}
}
