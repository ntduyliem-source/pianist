import type { ScoreSnapshot } from '../../../../packages/score-contracts';
import {
  type PracticeSettings,
  type AttemptResult,
  type SavedAttempt,
  settingsFor,
} from '../../../../packages/practice-engine-v2';

import * as storage from '../platform/storage';

/** Persistence and device-local preferences; never owns grading or transport time. */
export class PracticeRepository {
  async list() {
    const [projects, history] = await Promise.all([
      storage.list<storage.ProjectRecord>('projects'),
      storage.list<SavedAttempt>('sessions'),
    ]);
    return {
      projects: projects.sort((a, b) => b.updatedAt - a.updatedAt),
      history: history.sort((a, b) => b.createdAt - a.createdAt),
    };
  }

  private normalize(
    snapshot: ScoreSnapshot,
    config: PracticeSettings,
    deviceId: string,
  ): PracticeSettings {
    return {
      ...config,
      version: 2,
      roles: { ...settingsFor(snapshot).roles, ...config.roles },
      fromMeasure: Math.max(0, Math.min(snapshot.measures.length - 1, config.fromMeasure)),
      toMeasure: Math.max(
        Math.max(0, Math.min(snapshot.measures.length - 1, config.fromMeasure)),
        Math.min(snapshot.measures.length - 1, config.toMeasure),
      ),
      deviceId,
      inputSource: deviceId === 'virtual' ? 'virtual' : 'midi',
    };
  }

  async loadSettings(
    snapshot: ScoreSnapshot,
    deviceId: string,
    current?: { projectId?: string; config?: PracticeSettings },
    overrides?: Partial<PracticeSettings>,
  ): Promise<PracticeSettings> {
    const saved = await storage.get<{ id: string; config: PracticeSettings }>(
      'settings',
      'practice-v2:' + snapshot.projectId,
    );
    const calibration = await storage.get<{ id: string; offsetMs: number }>(
      'settings',
      'calibration-v2:' + deviceId,
    );
    const prior = current?.projectId === snapshot.projectId ? current.config : saved?.config;
    const config = this.normalize(
      snapshot,
      { ...settingsFor(snapshot), ...prior, ...overrides, version: 2 },
      deviceId,
    );
    config.offsetMs =
      overrides?.offsetMs ??
      calibration?.offsetMs ??
      (prior?.deviceId === deviceId ? prior.offsetMs : 0);
    return config;
  }

  updateSettings(
    snapshot: ScoreSnapshot,
    current: PracticeSettings,
    patch: Partial<PracticeSettings>,
    deviceId: string,
  ): PracticeSettings {
    const config = { ...current, ...patch, version: 2 as const };
    if (current.deviceId !== deviceId) config.offsetMs = 0;
    else if (patch.deviceId !== undefined && patch.deviceId !== deviceId)
      config.offsetMs = current.offsetMs;
    return this.normalize(snapshot, config, deviceId);
  }

  async saveSettings(
    projectId: string,
    config: PracticeSettings,
    patch: Partial<PracticeSettings>,
  ): Promise<void> {
    const writes = [storage.put('settings', { id: 'practice-v2:' + projectId, config })];
    if (
      patch.offsetMs !== undefined &&
      patch.deviceId === undefined &&
      Number.isFinite(config.offsetMs) &&
      Math.abs(config.offsetMs) <= 500
    )
      writes.push(
        storage.put('settings', {
          id: 'calibration-v2:' + config.deviceId,
          offsetMs: config.offsetMs,
        }),
      );
    await Promise.all(writes);
  }

  async saveAttempt(result: AttemptResult, keepReplay: boolean): Promise<void> {
    if (!keepReplay) delete result.replay;
    await storage.saveSession(result);
  }
}
