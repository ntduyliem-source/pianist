import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { PracticeRepository } from '../src/application/practice-repository';
import { settingsFor } from '../../../packages/practice-engine-v2/score-adapter';
import { scoreFixture } from './helpers/fixtures-v2';
import * as storage from '../src/platform/storage';

test('saved practice settings retain range/roles while offsets belong to the selected MIDI device', async () => {
  const repository = new PracticeRepository(), snapshot = scoreFixture();
  snapshot.projectId = 'repository-settings-test';
  const saved = {...settingsFor(snapshot), deviceId: 'old-piano', offsetMs: 120, bpm: 75, fromMeasure: -8, toMeasure: 999};
  await storage.put('settings', {id: 'practice-v2:' + snapshot.projectId, config: saved});
  const changedDevice = await repository.loadSettings(snapshot, 'new-piano');
  assert.equal(changedDevice.bpm, 75); assert.equal(changedDevice.offsetMs, 0);
  assert.equal(changedDevice.fromMeasure, 0); assert.equal(changedDevice.toMeasure, snapshot.measures.length - 1);
  assert.equal(changedDevice.inputSource, 'midi');
  await storage.put('settings', {id: 'calibration-v2:new-piano', offsetMs: 35});
  const calibrated = await repository.loadSettings(snapshot, 'new-piano');
  assert.equal(calibrated.offsetMs, 35);
  const override = await repository.loadSettings(snapshot, 'new-piano', {projectId: snapshot.projectId, config: {...saved, bpm: 90}}, {offsetMs: 0});
  assert.equal(override.offsetMs, 0); assert.equal(override.bpm, 90);
});

test('replaying foreign-device settings cannot overwrite this device calibration', async () => {
  const repository = new PracticeRepository(), snapshot = scoreFixture();
  snapshot.projectId = 'repository-foreign-device';
  const current = {...settingsFor(snapshot), deviceId: 'my-piano', offsetMs: 30};
  await storage.put('settings', {id: 'calibration-v2:my-piano', offsetMs: 30});
  const patch = {deviceId: 'someone-else', offsetMs: 200};
  const next = repository.updateSettings(snapshot, current, patch, 'my-piano');
  await repository.saveSettings(snapshot.projectId, next, patch);
  assert.equal(next.offsetMs, 30); assert.equal(next.deviceId, 'my-piano');
  assert.equal((await storage.get<{offsetMs: number}>('settings', 'calibration-v2:my-piano'))?.offsetMs, 30);
  const updated = repository.updateSettings(snapshot, next, {offsetMs: 45}, 'my-piano');
  await repository.saveSettings(snapshot.projectId, updated, {offsetMs: 45});
  assert.equal((await storage.get<{offsetMs: number}>('settings', 'calibration-v2:my-piano'))?.offsetMs, 45);
});
