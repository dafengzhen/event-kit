import type { AbortReason, EventState, ExecOptions, ExecutorContext } from './types.ts';

/**
 * Executor.
 *
 * @author dafengzhen
 */
export class Executor<T = void> {
  private readonly handler: (ctx: ExecutorContext) => Promise<T> | T;

  private readonly options: Pick<ExecOptions, 'signal'> &
    Required<
      Pick<
        ExecOptions,
        | 'maxRetries'
        | 'onCancel'
        | 'onRetryAttempt'
        | 'onStateChange'
        | 'onTimeout'
        | 'retryDelay'
        | 'shouldRetry'
        | 'throwOnError'
        | 'timeoutMs'
      >
    >;

  constructor(handler: (ctx: ExecutorContext) => Promise<T> | T, options: ExecOptions = {} as ExecOptions) {
    this.handler = handler;
    this.options = {
      maxRetries: options.maxRetries ?? 3,
      onCancel: options.onCancel ?? (() => {}),
      onRetryAttempt: options.onRetryAttempt ?? (() => {}),
      onStateChange: options.onStateChange ?? (() => {}),
      onTimeout: options.onTimeout ?? (() => {}),
      retryDelay: options.retryDelay ?? 1000,
      shouldRetry: options.shouldRetry ?? (() => false),
      signal: options.signal,
      throwOnError: options.throwOnError ?? false,
      timeoutMs: options.timeoutMs ?? 30_000,
    };
  }

  async execute(): Promise<T | undefined> {
    let attemptIndex = 0;
    let state: EventState = 'pending';

    const setState = (newState: EventState, error?: unknown) => {
      if (state !== newState) {
        state = newState;
        this.options.onStateChange({
          attemptIndex,
          error,
          retryCount: attemptIndex,
          state: newState,
        });
      }
    };

    while (true) {
      try {
        setState(attemptIndex === 0 ? 'running' : 'retrying');

        const result = await this.executeHandlerWithTimeout({
          attemptIndex,
          retryCount: attemptIndex,
        });

        setState('succeeded');
        return result;
      } catch (err) {
        if (err instanceof ExecutorCancelledError) {
          setState('cancelled', err);
          this.options.onCancel();
          if (this.options.throwOnError) {
            throw err;
          }
          return undefined;
        }

        if (err instanceof ExecutorTimeoutError) {
          setState('timeout', err);
          this.options.onTimeout(this.options.timeoutMs);
        }

        const canRetry = this.canRetry(attemptIndex, err);
        if (!canRetry) {
          setState('failed', err);
          if (this.options.throwOnError) {
            throw err;
          }
          return undefined;
        }

        const nextAttemptIndex = attemptIndex + 1;
        this.options.onRetryAttempt({
          attemptIndex: nextAttemptIndex,
          error: err,
          retryCount: nextAttemptIndex,
        });

        const delayMs = this.calculateRetryDelay({
          attemptIndex: nextAttemptIndex,
          error: err,
          retryCount: nextAttemptIndex,
        });

        attemptIndex = nextAttemptIndex;

        if (delayMs > 0) {
          await this.waitWithCancellation(delayMs);
        }
      }
    }
  }

  private calculateRetryDelay(ctx: { attemptIndex: number; error: unknown; retryCount: number }): number {
    const d = this.options.retryDelay;
    const raw = typeof d === 'function' ? d(ctx) : d;
    return Math.max(0, raw);
  }

  private canRetry(attemptIndex: number, error: unknown): boolean {
    const retryCountSoFar = attemptIndex;
    const retriesRemaining = this.options.maxRetries - retryCountSoFar;
    if (retriesRemaining <= 0) {
      return false;
    }

    return this.options.shouldRetry({
      attemptIndex,
      error,
      retryCount: retryCountSoFar,
    });
  }

  private executeHandlerWithTimeout(meta: { attemptIndex: number; retryCount: number }): Promise<T> {
    const { signal: outer, timeoutMs } = this.options;

    const enableTimeout = (timeoutMs ?? 0) > 0;
    const enableOuter = !!outer;

    if (!enableTimeout && !enableOuter) {
      const dummySignal = new AbortController().signal;
      return Promise.resolve(
        this.handler({
          attemptIndex: meta.attemptIndex,
          retryCount: meta.retryCount,
          signal: dummySignal,
        }),
      );
    }

    const controller = new AbortController();
    const inner = controller.signal;

    let timeoutId: null | ReturnType<typeof setTimeout> = null;
    let outerHandler: (() => void) | null = null;
    let abortedBy: AbortReason | null = null;

    if (outer) {
      outerHandler = () => {
        abortedBy = 'outer';
        controller.abort();
      };
      outer.addEventListener('abort', outerHandler);
    }

    if (enableTimeout) {
      timeoutId = setTimeout(() => {
        abortedBy = 'timeout';
        controller.abort();
      }, timeoutMs);
    }

    return new Promise<T>((resolve, reject) => {
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (outer && outerHandler) {
          outer.removeEventListener('abort', outerHandler);
        }

        inner.removeEventListener('abort', onAbort);
      };

      const onAbort = () => {
        cleanup();
        if (abortedBy === 'outer') {
          reject(new ExecutorCancelledError());
        } else {
          reject(new ExecutorTimeoutError(timeoutMs));
        }
      };

      inner.addEventListener('abort', onAbort);

      Promise.resolve(
        this.handler({
          attemptIndex: meta.attemptIndex,
          retryCount: meta.retryCount,
          signal: inner,
        }),
      ).then(
        (val) => {
          cleanup();
          resolve(val);
        },
        (err) => {
          cleanup();
          reject(err);
        },
      );
    });
  }

  private waitWithCancellation(ms: number): Promise<void> {
    const sig = this.options.signal;

    if (!sig) {
      return new Promise((res) => setTimeout(res, ms));
    }

    if (sig.aborted) {
      return Promise.reject(new ExecutorCancelledError('Cancelled during wait'));
    }

    return new Promise((resolve, reject) => {
      let timeoutId: null | ReturnType<typeof setTimeout> = null;

      const onAbort = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        sig.removeEventListener('abort', onAbort);
        reject(new ExecutorCancelledError('Cancelled during wait'));
      };

      sig.addEventListener('abort', onAbort);

      timeoutId = setTimeout(() => {
        sig.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
    });
  }
}

/**
 * ExecutorError.
 *
 * @author dafengzhen
 */
export class ExecutorError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ExecutorError';
  }
}

/**
 * ExecutorCancelledError.
 *
 * @author dafengzhen
 */
export class ExecutorCancelledError extends ExecutorError {
  constructor(message = 'Operation was cancelled') {
    super('CANCELLED', message);
    this.name = 'ExecutorCancelledError';
  }
}

/**
 * ExecutorTimeoutError.
 *
 * @author dafengzhen
 */
export class ExecutorTimeoutError extends ExecutorError {
  constructor(
    public readonly timeoutMs: number,
    message = `Operation timed out after ${timeoutMs}ms`,
  ) {
    super('TIMEOUT', message);
    this.name = 'ExecutorTimeoutError';
  }
}
