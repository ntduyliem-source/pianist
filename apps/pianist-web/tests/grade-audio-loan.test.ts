import test from 'node:test';
import assert from 'node:assert/strict';
import { GradeAudioLoan } from '../src/application/grade-audio-loan';
import type { EngineBridge } from '../../../packages/engine-bridge';

function native() {
  const state = { available: false, loads: 0, restores: 0, restore: true };
  const bridge = { setPractice() {}, serialize: () => Uint8Array.of(7), audition() {}, auditionState: () => ({available: state.available}), api: {
    loadPracticeScore: () => { state.loads++; return 1; }, restorePracticeScore: () => { state.restores++; return state.restore ? 1 : 0; },
  } } as unknown as EngineBridge;
  return {state, bridge};
}

test('restoring native editor invalidates a pending grade readiness request', async () => {
  const loan = new GradeAudioLoan(), {state, bridge} = native();
  const pending = loan.borrow(bridge, Uint8Array.of(1), new AbortController().signal, true);
  assert.equal(loan.active, true); assert.deepEqual(loan.editorBackup, Uint8Array.of(7));
  assert.equal(loan.restore({} as EngineBridge), false);
  assert.equal(loan.restore(bridge), true); state.available = true;
  await assert.rejects(pending, {name: 'AbortError'});
  assert.equal(state.restores, 1); assert.equal(loan.editorBackup, undefined);
});

test('replacement grade request cannot let a stale readiness loop resolve', async () => {
  const loan = new GradeAudioLoan(), {state, bridge} = native();
  const pending = loan.borrow(bridge, Uint8Array.of(1), new AbortController().signal, true);
  state.available = true;
  await loan.borrow(bridge, Uint8Array.of(2), new AbortController().signal, true);
  await assert.rejects(pending, {name: 'AbortError'});
  state.restore = false;
  assert.throws(() => loan.restore(bridge), /phục hồi/);
  assert.equal(loan.active, true); assert.deepEqual(loan.editorBackup, Uint8Array.of(7));
});
