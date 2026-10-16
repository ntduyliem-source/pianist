import type { CoreState, InputEvent, Plan, ReplayStep, SessionResult, SessionStatus } from '../../../../packages/score-contracts/index';
import { summarize } from '../../../../packages/practice-core/results';
import { PracticeTransport } from '../platform/transport';

export class PracticeSession {
  readonly transport = new PracticeTransport();
  status: SessionStatus = 'ready'; position = 0; reason = ''; epoch = 0;
  state: CoreState = {assessments: [], extras: [], cursor: 0, done: false, faults: [], firstTry: 0, groupsDone: 0, corrections: 0, held: [], missing: []};
  events: InputEvent[] = []; private worker?: Worker; private timer?: number; private lastWake = 0; private resumeAt = 0;
  commands: ReplayStep[] = []; replayComplete = true;
  private log(step: ReplayStep): void {if (this.commands.length < 250000) this.commands.push(step); else this.replayComplete = false;}
  private finishing?: {outcome: SessionResult['outcome']; resolve: (result: SessionResult) => void};
  private finishPromise?: Promise<SessionResult>; private finalResult?: SessionResult; private workerFailed = false;
  private transportOperation = 0; private starting = false; private transportReady = false;
  onChange: () => void = () => {}; onComplete: (result: SessionResult) => void = () => {};
  constructor(readonly plan: Plan, readonly title: string, readonly inputAvailable: () => boolean = () => true) {this.transport.onSuspend = () => this.pause('Âm thanh bị tạm dừng. Bấm Tiếp tục để đếm vào lại.', true);}
  get countInRemainingMs(): number {return Math.max(0, this.resumeAt - this.position);}
  async start(): Promise<void> {
    if (this.status !== 'ready' || this.starting) return;
    if (!this.inputAvailable()) throw Error('Chọn đúng thiết bị đầu vào trước khi bắt đầu.');
    this.starting = true;
    this.worker?.terminate(); ++this.epoch;
    this.worker = new Worker(new URL('../../../../packages/practice-worker/practice.worker.ts', import.meta.url), {type: 'module'});
    this.worker.onmessage = ({data}) => {
      if (data.epoch !== this.epoch) return;
      if (data.type === 'error') {this.workerError(data.message); return;}
      this.state = {...data.state, assessments: [...this.state.assessments, ...data.state.assessments], extras: [...this.state.extras, ...data.state.extras]};
      if (this.state.faults.length && !['paused', 'interrupted', 'finished'].includes(this.status)) this.pause('Luồng MIDI bị trễ/thất lạc. Buổi tập đã gián đoạn để tránh chấm sai.', true);
      if (data.type === 'final' && this.finishing) {
        const pending = this.finishing; this.finishing = undefined; const result = this.finalResult = this.result(pending.outcome); pending.resolve(result); return;
      }
      if (this.state.done && this.status !== 'finished') {this.status = 'finished'; this.transport.stop(); clearInterval(this.timer); this.finalResult = this.result('complete'); this.onComplete(this.finalResult);}
      this.onChange();
    };
    this.worker.onerror = () => this.workerError('Bộ chấm gặp lỗi. Hãy kết thúc lượt này rồi bắt đầu lượt mới.');
    this.worker.postMessage({type: 'init', epoch: this.epoch, plan: this.plan});
    try {await this.beginTransport(0);} finally {this.starting = false;}
  }
  private async beginTransport(at: number): Promise<void> {
    const operation = ++this.transportOperation;
    this.transportReady = false;
    this.resumeAt = at; this.position = at; this.reason = ''; this.status = 'counting'; this.onChange();
    try {await this.transport.start(this.plan, at);} catch (error) {
      if (operation === this.transportOperation) {this.transport.stop(); this.status = 'interrupted'; this.reason = 'Không khởi động được âm thanh. Bấm Tiếp tục để thử lại.'; this.onChange();}
      throw error;
    }
    if (operation !== this.transportOperation || this.workerFailed) {this.transport.stop(); return;}
    this.transportReady = true;
    this.log({kind: 'clearHeld', atMs: at}); this.worker?.postMessage({type: 'resume', epoch: this.epoch});
    this.lastWake = performance.now(); clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      const now = performance.now(), gap = now - this.lastWake; this.lastWake = now;
      if (gap > 500) {this.pause('Trình duyệt bị gián đoạn quá 500 ms. Bấm Tiếp tục để đếm vào lại.', true); return;}
      this.transport.schedule(); const pos = this.transport.position();
      if (pos < this.resumeAt) {this.position = pos; this.onChange(); return;}
      if (this.status === 'counting') this.status = 'running';
      this.position = pos;
      this.log({kind: 'advance', atMs: pos});
      this.worker?.postMessage({type: 'tick', epoch: this.epoch, now: pos}); this.onChange();
    }, 40);
    this.onChange();
  }
  input(event: InputEvent): void {
    if (event.source !== this.plan.config.inputSource || event.deviceId !== this.plan.config.deviceId || !['running', 'counting'].includes(this.status)) return;
    if (!this.transportReady) return;
    // Convert both timestamps with the same clock pair, preserving delivery delay.
    const receivedMs = this.transport.relative(event.receivedMs);
    const e = {...event, epoch: this.epoch, atMs: receivedMs + event.atMs - event.receivedMs, receivedMs};
    const corrected = e.atMs - (this.plan.config.mode === 'bpm' ? this.plan.config.offsetMs : 0);
    const earliest = this.resumeAt === 0 && this.plan.config.mode === 'bpm' ? -this.plan.config.windowMs : this.resumeAt;
    if (corrected < earliest) return;
    if (this.events.length < 200000) this.events.push(e);
    this.log({kind: 'event', event: e});
    this.worker?.postMessage({type: 'event', epoch: this.epoch, event: e});
  }
  pause(reason = 'Đã tạm dừng. Tiếp tục sẽ đếm vào lại.', interrupted = false): void {
    if (!['running', 'counting'].includes(this.status)) return;
    ++this.transportOperation;
    this.transportReady = false;
    this.position = Math.max(this.resumeAt, this.transport.position());
    this.status = interrupted ? 'interrupted' : 'paused'; this.reason = reason;
    this.log({kind: 'clearHeld', atMs: this.position});
    this.transport.stop(); clearInterval(this.timer); this.worker?.postMessage({type: 'pause', epoch: this.epoch}); this.onChange();
  }
  async resume(): Promise<void> {
    if (!['paused', 'interrupted'].includes(this.status)) return;
    if (!this.inputAvailable()) throw Error('Kết nối và chọn lại đúng thiết bị của lượt này, hoặc Kết thúc để đổi đàn.');
    if (this.state.faults.length) throw Error('Lượt này có dữ liệu MIDI không đủ tin cậy. Bấm Kết thúc rồi tập lại.');
    if (this.starting) return;
    this.starting = true; try {await this.beginTransport(this.position);} finally {this.starting = false;}
  }
  finish(outcome: SessionResult['outcome'] = 'aborted'): Promise<SessionResult> {
    if (this.finalResult) return Promise.resolve(this.finalResult);
    if (this.finishPromise) return this.finishPromise;
    if (!this.worker || this.workerFailed || this.status === 'finished') {this.status = 'finished'; this.finalResult = this.result(this.workerFailed ? 'interrupted' : this.state.done ? 'complete' : outcome); return Promise.resolve(this.finalResult);}
    this.pause(); this.status = 'finished';
    return this.finishPromise = new Promise(resolve => {this.finishing = {outcome, resolve}; this.worker!.postMessage({type: 'finish', epoch: this.epoch});});
  }
  private workerError(message: string): void {
    this.workerFailed = true; this.state.faults = [...this.state.faults, 'worker-error']; this.pause(message, true);
    if (this.status === 'ready') {++this.transportOperation; this.status = 'interrupted'; this.reason = message; this.onChange();}
    if (this.finishing) {const pending = this.finishing; this.finishing = undefined; this.finalResult = this.result('interrupted'); pending.resolve(this.finalResult);}
  }
  private result(outcome: SessionResult['outcome']): SessionResult {return summarize(this.plan, this.state, this.title, outcome, Math.max(0, this.position), this.transport.source);}
  dispose(): void {clearInterval(this.timer); ++this.epoch; ++this.transportOperation; this.worker?.terminate(); this.worker = undefined; this.transport.stop(); void this.transport.context?.close();}
}
