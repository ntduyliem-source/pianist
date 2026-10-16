import {ALGORITHM_VERSION, type CoreState, type Plan, type ReplayStep} from '../score-contracts/index';
import {BpmCore} from './bpm';
import {WaitCore} from './wait';

// Replays the actual worker commands, including pause/resume key-state boundaries.
// Drawing frames are deliberately absent from this protocol.
export function replay(plan: Plan, commands: ReplayStep[]): CoreState {
  if (plan.schemaVersion !== 1 || commands.length > 250000) throw Error('Unsupported or oversized replay.');
  if (plan.config.algorithmVersion !== ALGORITHM_VERSION) throw Error(`Replay requires ${plan.config.algorithmVersion}; this build supports ${ALGORITHM_VERSION}. Use the matching source release.`);
  const core = plan.config.mode === 'bpm' ? new BpmCore(plan) : new WaitCore(plan);
  for (const step of commands) {
    if (step.kind === 'event') core.input(step.event);
    else if (step.kind === 'advance') core.advance(step.atMs);
    else if (step.kind === 'clearHeld') core.clearHeld();
    else throw Error('Unknown replay command.');
  }
  return core.state();
}
