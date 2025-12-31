import type { ApiMetrics, RequestEndReason } from './types.ts';

const createEmptyMetrics = (): ApiMetrics => ({
  cache: { hit: 0, miss: 0, size: 0, stale: 0 },
  queue: { active: 0, length: 0, pending: 0 },
  requests: { active: 0, error: 0, retry: 0, success: 0, timeout: 0, total: 0 },
});

const clamp0 = (n: number): number => (Number.isFinite(n) ? Math.max(0, n) : 0);

/**
 * MetricsCollector.
 *
 * @author dafengzhen
 */
export class MetricsCollector {
  private readonly enabled: boolean;

  private metrics: ApiMetrics = createEmptyMetrics();

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  cacheHit(): void {
    if (!this.enabled) {
      return;
    }
    this.metrics.cache.hit++;
  }

  cacheMiss(): void {
    if (!this.enabled) {
      return;
    }
    this.metrics.cache.miss++;
  }

  cacheStale(): void {
    if (!this.enabled) {
      return;
    }
    this.metrics.cache.stale++;
  }

  requestEnd(reason: RequestEndReason): void {
    if (!this.enabled) {
      return;
    }

    this.metrics.requests.active = Math.max(0, this.metrics.requests.active - 1);

    switch (reason) {
      case 'canceled':
        return;
      case 'error':
        this.metrics.requests.error++;
        return;
      case 'success':
        this.metrics.requests.success++;
        return;
      case 'timeout':
        this.metrics.requests.timeout++;
        return;
      default: {
        // noinspection UnnecessaryLocalVariableJS
        const _exhaustive: never = reason;
        void _exhaustive;
      }
    }
  }

  requestStart(): void {
    if (!this.enabled) {
      return;
    }
    this.metrics.requests.total++;
    this.metrics.requests.active++;
  }

  reset(): void {
    if (!this.enabled) {
      return;
    }
    this.metrics = createEmptyMetrics();
  }

  retryHit(): void {
    if (!this.enabled) {
      return;
    }
    this.metrics.requests.retry++;
  }

  setActiveRequests(active: number): void {
    if (!this.enabled) {
      return;
    }
    this.metrics.queue.active = clamp0(active);
  }

  setCacheSize(size: number): void {
    if (!this.enabled) {
      return;
    }
    this.metrics.cache.size = clamp0(size);
  }

  setPending(count: number): void {
    if (!this.enabled) {
      return;
    }
    this.metrics.queue.pending = clamp0(count);
  }

  setQueueLength(length: number): void {
    if (!this.enabled) {
      return;
    }
    this.metrics.queue.length = clamp0(length);
  }

  snapshot(): ApiMetrics {
    if (!this.enabled) {
      return createEmptyMetrics();
    }
    return {
      cache: { ...this.metrics.cache },
      queue: { ...this.metrics.queue },
      requests: { ...this.metrics.requests },
    };
  }
}
