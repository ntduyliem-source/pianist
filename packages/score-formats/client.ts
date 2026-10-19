import {ScoreFormatError, type FormatJob, type FormatResult, type FormatWorkerMessage, type FormatWorkerRequest} from './model';

export interface FormatWorker {
  onmessage: ((event: MessageEvent<FormatWorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: FormatWorkerRequest): void;
  terminate(): void;
}
interface Options {workerFactory?: () => FormatWorker; baseUrl?: string; bootTimeoutMs?: number; conversionTimeoutMs?: number}
interface Pending {id: number; resolve: (value: FormatResult) => void; reject: (error: Error) => void; cleanup: () => void}

export class ScoreFormatClient {
  private worker?: FormatWorker;
  private pending?: Pending;
  private sequence = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private readonly options: Options = {}) {}
  private reset() {this.worker?.terminate(); this.worker = undefined;}
  private reject(error: Error) {
    const pending = this.pending; this.pending = undefined;
    clearTimeout(this.timer); pending?.cleanup(); this.reset(); pending?.reject(error);
  }
  cancel(): void {this.reject(new DOMException('Đã hủy mở file.', 'AbortError'));}
  dispose(): void {this.cancel();}
  async run(job: FormatJob, signal?: AbortSignal, onReady?: () => void): Promise<FormatResult> {
    signal?.throwIfAborted();
    if (this.pending) throw Error('Đang chuyển đổi một bản nhạc. Hãy chờ hoặc hủy thao tác hiện tại.');
    const id = ++this.sequence;
    const baseUrl = this.options.baseUrl ?? new URL('score-formats/', globalThis.location.href).href;
    const worker = this.worker ??= this.options.workerFactory?.()
      ?? new Worker(new URL('../score-format-worker/worker.ts', import.meta.url), {type: 'module'});
    return new Promise((resolve, reject) => {
      const abort = () => this.cancel();
      this.pending = {id, resolve, reject, cleanup: () => signal?.removeEventListener('abort', abort)};
      signal?.addEventListener('abort', abort, {once: true});
      const timeout = (ms: number) => {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.reject(Error('Chuyển đổi ABC quá thời gian. Bài đang mở được giữ; hãy thử file nhỏ hơn.')), ms);
      };
      timeout(this.options.bootTimeoutMs ?? 120000);
      worker.onmessage = ({data}: MessageEvent<FormatWorkerMessage>) => {
        const pending = this.pending;
        if (!pending || data.id !== pending.id) return;
        if ('phase' in data) {timeout(this.options.conversionTimeoutMs ?? 30000); onReady?.(); return;}
        this.pending = undefined;
        clearTimeout(this.timer); pending.cleanup();
        if (data.result.ok) pending.resolve(data.result);
        else pending.reject(new ScoreFormatError(data.result.diagnostics));
      };
      worker.onerror = () => {if (this.worker === worker) this.reject(Error('Bộ chuyển đổi ABC bị gián đoạn. Bài đang mở được giữ; có thể thử lại.'));};
      try {worker.postMessage({...job, id, baseUrl});}
      catch (error) {this.reject(error instanceof Error ? error : Error(String(error)));}
    });
  }
}
