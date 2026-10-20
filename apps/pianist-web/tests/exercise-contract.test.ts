import test from 'node:test';
import assert from 'node:assert/strict';
import {exerciseCounts, validateExerciseSettings} from '../../../packages/exercise-generator/contract';
import type {ExerciseSettings} from '../../../packages/exercise-generator/model';
import {createTimeline, settingsFor} from '../../../packages/practice-engine-v2/score-adapter';
import {scoreFixture} from './helpers/fixtures-v2';

test('quiz N uses physical attacks: chord, tie, unison, rest, repeated key and selected hand', () => {
  const s = scoreFixture(), base = s.anchors[0];
  s.staves.push({id: 1, part: 'Piano', partId: 'p'});
  s.anchors = [
    {...base, id: 'c', pitch: 60, tick: 0},
    {...base, id: 'e', pitch: 64, tick: 0},
    {...base, id: 'g', pitch: 67, tick: 0},
    {...base, id: 'tied-c', pitch: 60, tick: 480, tieBack: 'c'},
    {...base, id: 'unison', pitch: 60, tick: 0, staff: 1, track: 4},
    {...base, id: 'bass', pitch: 36, tick: 960, staff: 1, track: 4},
    {...base, id: 'repeat-c', pitch: 60, tick: 1440},
  ];
  s.performed = s.anchors.map(n => ({anchor: n.id, occurrence: 0, atMs: n.tick / 480 * 500, endMs: (n.tick + n.durationTicks) / 480 * 500}));
  const settings = settingsFor(s);
  assert.equal(s.anchors.length, 7);
  assert.deepEqual(exerciseCounts(createTimeline(s, settings)), {targets: 5, onsets: 3});
  assert.deepEqual(exerciseCounts(createTimeline(s, {...settings, hand: 'right'})), {targets: 4, onsets: 2});
  assert.throws(() => exerciseCounts(createTimeline(s, {...settings, loops: 2})), /một lượt/);
});

test('quiz settings allow inclusive x=y and reject malformed, reversed or out-of-bounds ranges', () => {
  const valid: ExerciseSettings = {schemaVersion: 1, grade: 1, profileId: 'g1-step-quarter',
    notes: {min: 4, max: 4}, mode: 'bpm', bpm: 60, hand: 'right', durationEnabled: true, pedalEnabled: false};
  validateExerciseSettings(valid);
  validateExerciseSettings({...valid, notes: {min: 64, max: 64}});
  for (const notes of [{min: 3, max: 8}, {min: 8, max: 7}, {min: 4, max: 65}, {min: 4.5, max: 8}, {min: NaN, max: 8}]) {
    assert.throws(() => validateExerciseSettings({...valid, notes}), /không hợp lệ/);
  }
  for (const patch of [{grade: 9}, {profileId: ''}, {mode: 'free'}, {bpm: NaN}, {hand: 'off'}, {pedalEnabled: 'yes'}]) {
    assert.throws(() => validateExerciseSettings({...valid, ...patch} as ExerciseSettings), /không hợp lệ/);
  }
});
