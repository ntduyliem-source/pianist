import type { AttemptResult } from '../../../../packages/practice-engine-v2';

export interface PendingAttempt {
  result: AttemptResult;
  keepReplay: boolean;
  saving: boolean;
  error: string;
}

/** Retain the result independently of a mounted practice screen until a durable
 * write succeeds. Retrying the same ID is idempotent and shares an in-flight write. */
export class AttemptPersistence {
  private pending = new Map<string, PendingAttempt>();
  private writing = new Map<string, Promise<boolean>>();

  constructor(
    private readonly write: (result: AttemptResult, keepReplay: boolean) => Promise<void>,
    private readonly changed: (pending: PendingAttempt[]) => void,
  ) {}

  private publish() {
    this.changed([...this.pending.values()]);
  }

  save(result: AttemptResult, keepReplay: boolean): Promise<boolean> {
    const running = this.writing.get(result.id);
    if (running) return running;
    const item: PendingAttempt = {
      result,
      keepReplay,
      saving: true,
      error: this.pending.get(result.id)?.error ?? '',
    };
    this.pending.set(result.id, item);
    this.publish();
    const operation = Promise.resolve()
      .then(() => this.write({ ...result }, keepReplay))
      .then(() => {
        this.pending.delete(result.id);
        return true;
      })
      .catch((error: unknown) => {
        this.pending.set(result.id, {
          ...item,
          saving: false,
          error:
            error instanceof DOMException && error.name === 'QuotaExceededError'
              ? 'Bộ nhớ trình duyệt đã đầy.'
              : error instanceof Error
                ? error.message
                : String(error),
        });
        return false;
      })
      .finally(() => {
        this.writing.delete(result.id);
        this.publish();
      });
    this.writing.set(result.id, operation);
    return operation;
  }

  retry(id: string): Promise<boolean> {
    const item = this.pending.get(id);
    return item ? this.save(item.result, item.keepReplay) : Promise.resolve(true);
  }
}
