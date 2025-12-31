import type {
  Permit,
  QueueClosedErrorOptions,
  QueueEntry,
  RequestQueueStats,
  RequestQueueStatsListener,
} from './types.ts';

/**
 * AbortWaitError.
 *
 * @author dafengzhen
 */
export class AbortWaitError extends Error {
  code?: string;
  constructor(message = 'Request aborted while waiting in queue') {
    super(message);
    this.name = 'AbortError';
    this.code = 'CANCELED';
  }
}

/**
 * QueueClosedError.
 *
 * @author dafengzhen
 */
export class QueueClosedError extends Error {
  code?: string;
  constructor(message = 'RequestQueue is closed', opts: QueueClosedErrorOptions = {}) {
    super(message);
    this.name = 'QueueClosedError';
    this.code = opts.code ?? 'QUEUE_CLOSED';
  }
}

/**
 * RequestQueue.
 *
 * @author dafengzhen
 */
export class RequestQueue {
  get active(): number {
    return this.activeCount;
  }

  get capacity(): number {
    return this.maxConcurrent;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get pending(): number {
    return this.waitQueue.length;
  }

  private activeCount = 0;

  private closed = false;

  private closedReason: Error | null = null;

  private readonly maxConcurrent: number;

  private readonly statsListeners = new Set<RequestQueueStatsListener>();

  private readonly waitQueue: QueueEntry[] = [];

  constructor(maxConcurrent: number) {
    if (!Number.isFinite(maxConcurrent) || maxConcurrent <= 0) {
      throw new Error('maxConcurrent must be a positive number.');
    }
    this.maxConcurrent = Math.floor(maxConcurrent);
  }

  acquire(signal?: AbortSignal): Promise<Permit> {
    if (this.closed) {
      return Promise.reject(this.closedReason ?? new QueueClosedError());
    }

    if (signal?.aborted) {
      return Promise.reject(new AbortWaitError());
    }

    if (this.activeCount < this.maxConcurrent) {
      this.activeCount++;
      this.emitStats();
      return Promise.resolve(this.createPermit());
    }

    return new Promise<Permit>((resolve, reject) => {
      const entry: QueueEntry = { reject, resolve, signal };

      const onAbort = () => {
        this.removeEntry(entry);
        reject(new AbortWaitError());
      };

      entry.onAbort = onAbort;

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      this.waitQueue.push(entry);
      this.emitStats();
    });
  }

  clear(reason: Error = new QueueClosedError('RequestQueue cleared')): void {
    while (this.waitQueue.length > 0) {
      const e = this.waitQueue.shift()!;
      this.cleanupAbortListener(e);
      e.reject(reason);
    }
  }

  close(reason: Error = new QueueClosedError()): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.closedReason = reason;

    while (this.waitQueue.length > 0) {
      const e = this.waitQueue.shift()!;
      this.cleanupAbortListener(e);
      e.reject(reason);
    }
  }

  getStats(): RequestQueueStats {
    return {
      active: this.activeCount,
      capacity: this.maxConcurrent,
      isClosed: this.closed,
      pending: this.waitQueue.length,
    };
  }

  onStatsChange(fn: RequestQueueStatsListener): () => void {
    this.statsListeners.add(fn);
    fn(this.getStats());
    return () => this.statsListeners.delete(fn);
  }

  release(): void {
    if (this.activeCount === 0) {
      throw new Error('RequestQueue.release() called with no active permits.');
    }

    this.activeCount--;

    while (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!;
      this.cleanupAbortListener(next);

      if (next.signal?.aborted) {
        continue;
      }

      this.activeCount++;
      next.resolve(this.createPermit());
      this.emitStats();
      return;
    }

    this.emitStats();
  }

  async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const permit = await this.acquire(signal);
    try {
      return await fn();
    } finally {
      permit.release();
    }
  }

  tryAcquire(): null | Permit {
    if (this.closed) {
      return null;
    }
    if (this.activeCount < this.maxConcurrent) {
      this.activeCount++;
      return this.createPermit();
    }
    return null;
  }

  async using(signal?: AbortSignal): Promise<() => void> {
    const permit = await this.acquire(signal);
    return permit.release;
  }

  private cleanupAbortListener(entry: QueueEntry): void {
    if (entry.signal && entry.onAbort) {
      entry.signal.removeEventListener('abort', entry.onAbort);
    }
  }

  private createPermit(): Permit {
    let released = false;
    return {
      release: () => {
        if (released) {
          return;
        }
        released = true;
        this.release();
      },
    };
  }

  private emitStats(): void {
    if (this.statsListeners.size === 0) {
      return;
    }
    const s = this.getStats();
    for (const fn of this.statsListeners) {
      fn(s);
    }
  }

  private removeEntry(entry: QueueEntry): void {
    const idx = this.waitQueue.indexOf(entry);
    if (idx >= 0) {
      const [removed] = this.waitQueue.splice(idx, 1);
      this.cleanupAbortListener(removed);
      this.emitStats();
    }
  }
}
