import type { CoreState, InputEvent, Plan } from '../score-contracts/index';
import { BpmCore } from '../practice-core/bpm';
import { WaitCore } from '../practice-core/wait';
const port = self as unknown as {postMessage(data: unknown): void; onmessage: ((event: MessageEvent) => void) | null};
let core: BpmCore | WaitCore | undefined, epoch = 0, stopped = false;
let sent = new Set<string>(), extraSent = new Set<number>();
port.onmessage = ({data}: MessageEvent) => {
  try {
    if (data.type === 'init') {epoch = data.epoch; core = data.plan.config.mode === 'bpm' ? new BpmCore(data.plan as Plan) : new WaitCore(data.plan as Plan); sent = new Set(); extraSent = new Set(); stopped = false;}
    if (!core || data.epoch !== epoch) return;
    if (data.type === 'event' && !stopped) core.input(data.event as InputEvent);
    if (data.type === 'pause') {stopped = true; core.clearHeld();}
    if (data.type === 'resume') {stopped = false; core.clearHeld();}
    if (data.type === 'tick' && !stopped || data.type === 'finish' || data.type === 'init') {
      const state: CoreState = data.type === 'tick' ? core.advance(data.now) : core.state();
      const delta = {...state, assessments: state.assessments.filter(a => !sent.has(a.targetId)), extras: state.extras.filter(e => !extraSent.has(e.seq))};
      delta.assessments.forEach(a => sent.add(a.targetId)); delta.extras.forEach(e => extraSent.add(e.seq));
      port.postMessage({type: data.type === 'finish' ? 'final' : 'progress', epoch, state: delta});
    }
  } catch (e) {port.postMessage({type: 'error', epoch, message: e instanceof Error ? e.message : String(e)});}
};
