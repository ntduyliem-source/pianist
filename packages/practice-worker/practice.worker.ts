import { ALGORITHM_VERSION, type CoreState, type InputEvent, type Plan } from '../score-contracts/index';
import { BpmCore } from '../practice-core/bpm';
import { WaitCore } from '../practice-core/wait';
const port = self as unknown as {postMessage(data: unknown): void; onmessage: ((event: MessageEvent) => void) | null};
let core: BpmCore | WaitCore | undefined, epoch = 0, stopped = false;
let sent = 0, extraSent = 0, releaseSent = 0;
let lastSignature = '';
port.onmessage = ({data}: MessageEvent) => {
  try {
    if (data.type === 'init') {
      epoch = data.epoch;
      if (data.plan.schemaVersion !== 1 || data.plan.config.algorithmVersion !== ALGORITHM_VERSION) throw Error('Phiên bản bộ chấm không tương thích. Hãy tải lại trang.');
      core = data.plan.config.mode === 'bpm' ? new BpmCore(data.plan as Plan) : new WaitCore(data.plan as Plan); sent = 0; extraSent = 0; releaseSent = 0; stopped = false; lastSignature = '';
    }
    if (!core || data.epoch !== epoch) return;
    if (data.type === 'event' && !stopped) core.input(data.event as InputEvent);
    if (data.type === 'pause') {stopped = true; core.clearHeld();}
    if (data.type === 'resume') {stopped = false; core.clearHeld();}
    if (data.type === 'tick' && !stopped || ['event', 'pause', 'resume', 'finish', 'init'].includes(data.type)) {
      const state: CoreState = data.type === 'tick' ? core.advance(data.now, sent, extraSent, releaseSent) : core.state(sent, extraSent, releaseSent);
      const signature = JSON.stringify([core.assessments.length, core.extras.length, state.done, state.faults,
        state.groupsDone, Math.ceil((state.restMs ?? 0) / 100), state.live, releaseSent + (state.releases?.length ?? 0)]);
      if (data.type === 'tick' && signature === lastSignature) return;
      lastSignature = signature;
      sent = core.assessments.length; extraSent = core.extras.length;
      releaseSent += state.releases?.length ?? 0;
      port.postMessage({type: data.type === 'finish' ? 'final' : 'progress', epoch, state});
    }
  } catch (e) {port.postMessage({type: 'error', epoch, message: e instanceof Error ? e.message : String(e)});}
};
