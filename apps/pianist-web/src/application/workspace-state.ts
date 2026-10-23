import type { PracticeSettings, SavedAttempt } from '../../../../packages/practice-engine-v2';
import type { ScoreSnapshot } from '../../../../packages/score-contracts';
import type { AbcTune, FormatDiagnostic } from '../../../../packages/score-formats';
import type { ProjectRecord } from '../platform/storage';
import type { BundledScore } from '../platform/bundled-library';

export type View = 'library' | 'editor' | 'practice' | 'results' | 'history';
export type PracticeKind = 'free' | 'grade';

export interface TuneSelection {
  requestId: number;
  filename: string;
  tunes: AbcTune[];
  sourceBytes: number;
  practice: boolean;
  selected: number[];
  openIndex: number;
  errors: Record<number, string>;
  error?: string;
}

export interface WorkspaceState {
  view: View;
  busy: string;
  error: string;
  toast: string;
  projects: ProjectRecord[];
  history: SavedAttempt[];
  current?: ProjectRecord;
  snapshot?: ScoreSnapshot;
  config?: PracticeSettings;
  result?: SavedAttempt;
  revision: number;
  savedRevision: number;
  recoveryRevision: number;
  saveState: string;
  engineReady: boolean;
  midiVersion: number;
  exampleTitle: string;
  bundledScores: BundledScore[];
  practicePicker: boolean;
  practiceKind: PracticeKind;
  canCancelOpen?: boolean;
  cancelOpenLabel?: string;
  engineFailed?: boolean;
  importDiagnostics?: FormatDiagnostic[];
  tuneSelection?: TuneSelection;
}

// A workspace owns its mutable collections; another instance must not inherit them.
export function createInitialWorkspaceState(): WorkspaceState {
  return {
    view: 'library',
    busy: '',
    error: '',
    toast: '',
    projects: [],
    history: [],
    bundledScores: [],
    revision: 0,
    savedRevision: 0,
    recoveryRevision: 0,
    saveState: '',
    engineReady: false,
    midiVersion: 0,
    exampleTitle: 'Piano khởi động',
    practicePicker: true,
    practiceKind: 'free',
  };
}
