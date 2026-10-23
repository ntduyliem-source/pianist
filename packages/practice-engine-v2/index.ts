// Public application API. Source-derived kernels stay behind this boundary.
export { ENGINE_ID } from './model';
export type {
  Hand,
  PracticeSettings,
  Target,
  PedalTarget,
  Visit,
  Timeline,
  MidiEvent,
  KeyInterval,
  PedalInterval,
  PedalControl,
  ReleaseJudgement,
  R4Report,
  Unconsumed,
  EngineView,
  ReplayCommand,
  AttemptStatus,
  AttemptResult,
  ArchivedAttempt,
  SavedAttempt,
  Snapshot,
} from './model';
export { PracticeEngine } from './engine';
export { settingsFor, validateSettings, createTimeline } from './score-adapter';
export { tempoAt } from './tempo';
export { resultFor, replayAttempt, canCompare, attemptCsv } from './results';
export { assessReleases } from './release-assessment';
export { hitWindows, type OnsetGrade } from './presentation';
