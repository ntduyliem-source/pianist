import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPlan, defaultConfig} from '../../../packages/practice-core/plan';
import {replay} from '../../../packages/practice-core/replay';
import {summarize} from '../../../packages/practice-core/results';
import type {ScoreSnapshot, SessionResult} from '../../../packages/score-contracts/index';
import {FeedbackIndex} from '../src/practice/feedback';
import {midiPlan, simulate, type MidiSimulation} from './helpers/midi-simulation';

const near = (actual: number | null | undefined, expected: number, tolerance = .001) => {
  assert.ok(actual !== undefined && actual !== null && Math.abs(actual - expected) < tolerance, `${actual} should equal ${expected} ± ${tolerance}`);
};
function checkReplay(simulation: MidiSimulation, result: SessionResult): void {
  const state = replay(simulation.plan, simulation.session.commands);
  const replayed = summarize(simulation.plan, state, result.title, result.outcome, result.elapsedMs, result.clock);
  const {id: originalId, createdAt: originalDate, ...original} = result;
  const {id: replayId, createdAt: replayDate, ...reproduced} = replayed;
  assert.deepEqual(reproduced, original, 'the recorded production session must replay to exactly the same result');
  assert.equal(new Set(result.assessments.map(a => a.targetId)).size, result.evaluated, 'worker deltas must not duplicate scores');
}

test('MIDI simulation: partial chord highlights immediately, pedal/duplicates cannot satisfy a fresh repeated note', async () => {
  const plan = midiPlan([[0, 60, 500], [0, 64, 500], [500, 60, 1000], [1000, 62, 1500]], {mode: 'wait'});
  await simulate(plan, async sim => {
    const {session, midi} = sim, index = new FeedbackIndex(plan);
    await sim.send(10, [0x90, 60, 90]);
    assert.equal(session.state.assessments.length, 0); assert.deepEqual(session.state.missing, [64]);
    assert.equal(index.markers(0, plan.groups[0], session.state).get('0')?.kind, 'pending');
    const accepted = session.events.length;
    await sim.send(20, [0x90, 60, 90]);
    midi.virtual(64, true); midi.receive([0x90, 64, 90], sim.now, 'unselected-piano', 'midi'); await sim.flush();
    assert.equal(session.events.length, accepted, 'held duplicates, virtual keys and the wrong port cannot add credit');
    await sim.send(30, [0x90, 61, 90]);
    assert.equal(session.state.live?.find(note => note.pitch === 61)?.state, 'extra');
    assert.equal(session.state.groupsDone, 0);
    await sim.send(40, [0xb0, 64, 127]); assert.equal(midi.pedal, true);
    await sim.send(50, [0x80, 61, 0]); await sim.send(60, [0x90, 60, 0]);
    await sim.send(70, [0x90, 64, 90]);
    assert.deepEqual(session.state.missing, [60], 'sustain does not keep a released physical key held');
    await sim.send(90, [0x90, 60, 90]); assert.equal(session.state.groupsDone, 1);
    await sim.send(100, [0x90, 60, 90]); assert.equal(session.state.groupsDone, 1);
    await sim.send(110, [0x90, 60, 0]); await sim.send(120, [0x90, 60, 90]);
    assert.equal(session.state.groupsDone, 2);
    await sim.send(140, [0x90, 62, 90]);
    const result = await session.finish();
    assert.deepEqual([result.outcome, result.matched, result.missed, result.extras, result.firstTry], ['complete', 4, 0, 1, 2]);
    assert.equal(result.timingRate, null); near(result.precision, .8); near(result.chords[0].spreadMs, 20);
    checkReplay(sim, result);
  });
});

test('MIDI simulation: signed chord errors, a missing repeated note, wrong pitch and late note keep independent BPM scores', async () => {
  const plan = midiPlan([[1000, 60], [1000, 64], [1500, 67], [1600, 67], [1700, 67], [2000, 62], [2500, 69]]);
  await simulate(plan, async sim => {
    await sim.hit(900, 60); await sim.hit(1100, 64);
    await sim.hit(1510, 67); await sim.hit(1710, 67);
    await sim.hit(2100, 61); await sim.send(2180, [0x90, 62, 90]);
    assert.equal(sim.session.state.live?.find(note => note.pitch === 62)?.grade, 'outside');
    await sim.send(2200, [0x80, 62, 0]);
    const result = await sim.complete();
    assert.deepEqual([result.matched, result.missed, result.extras, result.good], [5, 2, 1, 4]);
    assert.deepEqual(result.assessments.map(a => a.status), ['matched', 'matched', 'matched', 'missed', 'matched', 'matched', 'missed']);
    near(result.medianAbsMs, 100); near(result.chords[0].spreadMs, 200); near(result.precision, 5 / 6); near(result.timingRate, 4 / 7);
    assert.deepEqual(result.faults, []); checkReplay(sim, result);
  });
});

test('MIDI simulation: repeated-pitch live feedback realigns before final scoring', async () => {
  await simulate(midiPlan([[1000, 60], [1200, 60]]), async sim => {
    await sim.send(1140, [0x90, 60, 90]);
    const firstSeq = sim.session.events.at(-1)!.seq;
    assert.equal(sim.session.state.live?.find(note => note.seq === firstSeq)?.targetId, '1');
    assert.equal(sim.session.state.assessments.length, 0);
    await sim.send(1150, [0x80, 60, 0]); await sim.send(1210, [0x90, 60, 90]);
    assert.equal(sim.session.state.live?.find(note => note.seq === firstSeq)?.targetId, '0');
    assert.equal(sim.session.state.live?.find(note => note.seq === firstSeq)?.grade, 'outside');
    const result = await sim.complete();
    assert.deepEqual(result.assessments.map(a => a.grade), ['outside', 'perfect']);
    assert.equal(result.matched, 2); assert.equal(result.extras, 0); checkReplay(sim, result);
  });
});

test('MIDI simulation: same-pitch channels and channel reset preserve the other physical key, then clear provisional credit', async () => {
  await simulate(midiPlan([[0, 60], [0, 64]], {mode: 'wait'}), async sim => {
    await sim.send(10, [0x90, 60, 90]); await sim.send(20, [0x91, 60, 90]);
    await sim.send(30, [0xb1, 64, 127]); await sim.send(40, [0x80, 60, 0]);
    assert.deepEqual(sim.session.state.missing, [64]);
    await sim.send(50, [0xb0, 123, 0]);
    assert.deepEqual(sim.midi.heldPitches(), [60]); assert.equal(sim.midi.pedal, true);
    assert.equal(sim.session.status, 'interrupted'); assert.deepEqual(sim.session.state.held, []);
    await sim.session.resume(); await sim.flush();
    const resumeAt = sim.session.position;
    await sim.go(resumeAt + 20);
    await sim.send(resumeAt + 20, [0x91, 60, 90]);
    assert.equal(sim.session.state.live?.length, 0, 'a held key does not become a new attack after resume');
    await sim.send(resumeAt + 30, [0x81, 60, 0]); await sim.send(resumeAt + 40, [0x91, 60, 90]);
    await sim.send(resumeAt + 50, [0x90, 64, 90]);
    const result = await sim.session.finish(); assert.equal(result.matched, 2); assert.equal(result.extras, 0); checkReplay(sim, result);
  });
});

test('MIDI simulation: disconnect releases held keys/pedal, freezes the session and resumes only with the selected device', async () => {
  await simulate(midiPlan([[0, 60], [0, 64]], {mode: 'wait', countIn: 2}), async sim => {
    await sim.send(10, [0x90, 60, 90]); await sim.send(20, [0xb0, 64, 127]);
    await sim.disconnect();
    const pausedAt = sim.session.position;
    assert.equal(sim.session.status, 'interrupted'); assert.deepEqual(sim.midi.heldPitches(), []); assert.equal(sim.midi.pedal, false);
    assert.deepEqual(sim.session.state.held, []); assert.equal(sim.port.onmidimessage, null);
    await sim.advance(10000); assert.equal(sim.session.position, pausedAt);
    await assert.rejects(sim.session.resume(), /thiết bị/);
    await sim.reconnect(); assert.equal(sim.session.status, 'counting'); assert.equal(sim.port.opens, 2);
    sim.port.emit([0x90, 64, 90], sim.now); sim.port.emit([0x80, 64, 0], sim.now); await sim.flush();
    assert.equal(sim.session.state.assessments.length, 0, 'count-in input cannot complete the interrupted chord');
    await sim.send(pausedAt + 20, [0x90, 64, 90]); assert.deepEqual(sim.session.state.missing, [60]);
    await sim.send(pausedAt + 40, [0x90, 60, 90]);
    const result = await sim.session.finish();
    assert.deepEqual([result.outcome, result.matched, result.extras], ['complete', 2, 0]); checkReplay(sim, result);
  });
});

test('MIDI simulation: pause/resume preserves valid BPM onsets without grading the paused interval as misses', async () => {
  await simulate(midiPlan([[1000, 60], [1500, 64], [2000, 67]]), async sim => {
    await sim.hit(1000, 60); await sim.go(1100); sim.session.pause(); await sim.flush();
    const pausedAt = sim.session.position;
    await sim.advance(30000); assert.equal(sim.session.position, pausedAt);
    const accepted = sim.session.events.length;
    sim.port.emit([0x90, 70, 90], sim.now); sim.port.emit([0x80, 70, 0], sim.now); await sim.flush();
    assert.equal(sim.session.events.length, accepted);
    await sim.session.resume(); await sim.flush();
    await sim.hit(1500, 64); await sim.hit(2000, 67);
    const result = await sim.complete(); assert.deepEqual([result.matched, result.missed, result.extras], [3, 0, 0]); checkReplay(sim, result);
  });
});

for (const offsetMs of [-200, 80]) test(`MIDI simulation: offset ${offsetMs} ms is applied once despite variable delivery and epoch timestamps`, async () => {
  await simulate(midiPlan([[0, 60], [1000, 62], [2000, 64]], {offsetMs, countIn: 1}), async sim => {
    for (const [index, atMs] of [0, 1000, 2000].entries()) {
      const delay = [0, 119, 35][index];
      await sim.send(atMs + offsetMs, [0x90, 60 + index * 2, 90], delay, index === 2);
      await sim.send(atMs + offsetMs + 20, [0x80, 60 + index * 2, 0], delay, index === 2);
      near(sim.session.events.at(-1)!.receivedMs - sim.session.events.at(-1)!.atMs, delay);
    }
    const result = await sim.complete(); assert.equal(result.matched, 3); assert.equal(result.good, 3);
    result.assessments.forEach(a => near(a.deltaMs, 0)); assert.deepEqual(result.faults, []); checkReplay(sim, result);
  });
});

for (const deliveryMs of [121, -11]) test(`MIDI simulation: invalid delivery ${deliveryMs} ms interrupts before false miss/credit and refuses resume`, async () => {
  await simulate(midiPlan([[1000, 60], [2000, 62]]), async sim => {
    await sim.send(1000, [0x90, 60, 90], deliveryMs);
    assert.equal(sim.session.status, 'interrupted'); assert.deepEqual(sim.session.state.faults, ['delivery-delay']);
    assert.equal(sim.session.state.assessments.length, 0); assert.deepEqual(sim.session.state.held, []);
    await assert.rejects(sim.session.resume(), /không đủ tin cậy/);
    const result = await sim.session.finish('interrupted');
    assert.deepEqual([result.outcome, result.evaluated, result.missed, result.coverage], ['interrupted', 0, 0, null]); checkReplay(sim, result);
  });
});

test('MIDI simulation: stale worker epochs cannot alter the current session, including a forged final/error', async () => {
  await simulate(midiPlan([[1000, 60]]), async sim => {
    const previous = structuredClone(sim.session.state), epoch = sim.session.epoch - 1;
    sim.worker.postMessage({type: 'event', epoch, event: {seq: 900, epoch, type: 'on', pitch: 61, velocity: 90, channel: 0,
      deviceId: sim.port.id, source: 'midi', atMs: 1000, receivedMs: 1000}});
    sim.worker.postMessage({type: 'finish', epoch}); await sim.flush(); assert.deepEqual(sim.session.state, previous);
    sim.worker.onmessage?.({data: {type: 'final', epoch, state: {...previous, done: true}}});
    sim.worker.onmessage?.({data: {type: 'error', epoch, message: 'stale failure'}});
    assert.notEqual(sim.session.status, 'finished'); assert.deepEqual(sim.session.state.faults, []);
    await sim.hit(1000, 60); const result = await sim.complete(); assert.equal(result.matched, 1); assert.equal(result.extras, 0); checkReplay(sim, result);
  });
});

test('MIDI simulation: native repeat/tie/unison fixture has the same final score at 16/40/100 ms timer cadences', async () => {
  const score = JSON.parse(readFileSync(new URL('../../../tests/fixtures/pianist/practice/engine-snapshot.json', import.meta.url), 'utf8')) as ScoreSnapshot;
  const results: SessionResult[] = [];
  for (const period of [16, 40, 100]) {
    const plan = buildPlan(score, {...defaultConfig(score), mode: 'bpm', countIn: 0, metronome: false, inputSource: 'midi', deviceId: 'simulated-piano'});
    assert.equal(plan.targets.length, 16);
    await simulate(plan, async sim => {
      const packets = plan.targets.flatMap((target, i) => {
        // Omit every seventh attack, deliberately add +35 ms human error.
        if (i % 7 === 3) return [];
        const delivery = [5, 35, 80][i % 3];
        return [{at: target.atMs + 35, pitch: target.pitch, velocity: 90, delivery},
          {at: target.atMs + 55, pitch: target.pitch, velocity: 0, delivery}];
      }).sort((a, b) => a.at + a.delivery - b.at - b.delivery);
      for (const packet of packets) await sim.send(packet.at, [0x90, packet.pitch, packet.velocity], packet.delivery);
      const result = await sim.complete();
      assert.deepEqual([result.matched, result.missed, result.extras, result.good], [14, 2, 0, 14]);
      assert.deepEqual(result.faults, []); result.assessments.filter(a => a.status === 'matched').forEach(a => near(a.deltaMs, 35));
      checkReplay(sim, result); results.push(result);
    }, period);
  }
  const scoreOnly = ({assessments, extraEvents, matched, missed, precision, medianAbsMs, perLoop}: SessionResult) => ({assessments, extraEvents, matched, missed, precision, medianAbsMs, perLoop});
  assert.deepEqual(scoreOnly(results[0]), scoreOnly(results[1])); assert.deepEqual(scoreOnly(results[1]), scoreOnly(results[2]));
});
