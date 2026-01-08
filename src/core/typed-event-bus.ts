import type {
  AnyHandler,
  EmitContext,
  EventMapBase,
  ExactHandler,
  Handler,
  MatchKeys,
  Middleware,
  Pattern,
  PatternEntryInternal,
  PatternMiddleware,
} from './types.ts';

/**
 * TypedEventBus.
 *
 * @author dafengzhen
 */
export class TypedEventBus<E extends EventMapBase> {
  private anyHandlers = new Set<AnyHandler<E>>();

  private exact = new Map<keyof E, Set<ExactHandler<E, any>>>();

  private middlewares: Middleware<E>[] = [];

  private patternMiddlewares: PatternMiddleware<E>[] = [];

  private patterns: PatternEntryInternal<E>[] = [];

  clear(event?: keyof E): void {
    if (event === undefined) {
      this.exact.clear();
      this.anyHandlers.clear();
      this.patterns.length = 0;
      this.middlewares.length = 0;
      this.patternMiddlewares.length = 0;
      return;
    }

    this.exact.delete(event);
  }

  emit<K extends keyof E>(event: K, ...args: E[K] extends void ? [] : [payload: E[K]]): void {
    const payload = (args[0] as E[K]) ?? (undefined as E[K]);
    const ctx: EmitContext<E, K> = { event, matched: [], meta: undefined, payload };

    this.runMiddlewares(ctx).catch((err) => {
      queueMicrotask(() => {
        throw err;
      });
    });
  }

  async emitAsync<K extends keyof E>(event: K, ...args: E[K] extends void ? [] : [payload: E[K]]): Promise<void> {
    const payload = (args[0] as E[K]) ?? (undefined as E[K]);
    const ctx: EmitContext<E, K> = { event, matched: [], meta: undefined, payload };
    await this.runMiddlewares(ctx);
  }

  listenerCount(event: keyof E): number {
    return this.exact.get(event)?.size ?? 0;
  }

  off<K extends keyof E>(event: K, handler: Handler<E[K]>): void {
    const set = this.exact.get(event);
    if (!set) {
      return;
    }

    set.delete(handler);
    if (set.size === 0) {
      this.exact.delete(event);
    }
  }

  offPattern<P extends Pattern<Extract<keyof E, string>>>(
    pattern: P,
    handler: (event: keyof E, payload: E[keyof E]) => void,
  ): void {
    for (let i = this.patterns.length - 1; i >= 0; i--) {
      const p = this.patterns[i];
      if (p.pattern === pattern && p.handler === handler) {
        this.patterns.splice(i, 1);
      }
    }
  }

  on<K extends keyof E>(event: K, handler: Handler<E[K]>): () => void {
    this.getExactSet(event).add(handler);
    return () => this.off(event, handler);
  }

  onAny(handler: AnyHandler<E>): () => void {
    this.anyHandlers.add(handler);
    return () => this.anyHandlers.delete(handler);
  }

  once<K extends keyof E>(event: K, handler: Handler<E[K]>): () => void {
    const off = this.on(event, ((payload: E[K]) => {
      off();
      handler(payload);
    }) as any);
    return off;
  }

  oncePattern<P extends Pattern<Extract<keyof E, string>>>(
    pattern: P,
    handler: <K extends keyof E & MatchKeys<Extract<keyof E, string>, P>>(event: K, payload: E[K]) => void,
    options?: { priority?: number },
  ): () => void {
    return this.onPattern(pattern, handler, { ...options, once: true });
  }

  onPattern<P extends Pattern<Extract<keyof E, string>>>(
    pattern: P,
    handler: <K extends keyof E & MatchKeys<Extract<keyof E, string>, P>>(event: K, payload: E[K]) => void,
    options?: { once?: boolean; priority?: number },
  ): () => void {
    const info = this.parsePattern(pattern);

    const entry: PatternEntryInternal<E> = {
      handler: handler as any,
      kind: info.kind,
      once: options?.once,
      pattern,
      prefix: info.kind === 'prefix' ? info.prefix : undefined,
      prefixWithColon: info.kind === 'prefix' ? `${info.prefix}:` : undefined,
      priority: options?.priority ?? 0,
    };

    this.insertPatternSorted(entry);

    return () => {
      const idx = this.patterns.indexOf(entry);
      if (idx >= 0) {
        this.patterns.splice(idx, 1);
      }
    };
  }

  use(mw: Middleware<E>): () => void {
    this.middlewares.push(mw);
    return () => {
      const i = this.middlewares.indexOf(mw);
      if (i >= 0) {
        this.middlewares.splice(i, 1);
      }
    };
  }

  usePattern(mw: PatternMiddleware<E>): () => void {
    this.patternMiddlewares.push(mw);
    return () => {
      const i = this.patternMiddlewares.indexOf(mw);
      if (i >= 0) {
        this.patternMiddlewares.splice(i, 1);
      }
    };
  }

  private callHandlers<K extends keyof E>(event: K, payload: E[K]): void {
    const set = this.exact.get(event);
    if (set) {
      for (const fn of set) {
        try {
          fn(payload);
        } catch (e) {
          queueMicrotask(() => {
            throw e;
          });
        }
      }
    }

    for (const fn of this.anyHandlers) {
      try {
        fn(event, payload);
      } catch (e) {
        queueMicrotask(() => {
          throw e;
        });
      }
    }
  }

  private async callPatternHandlers(ctx: EmitContext<E, keyof E>): Promise<void> {
    const matched: PatternEntryInternal<E>[] = [];
    for (const p of this.patterns) {
      if (this.matchPattern(p, ctx.event)) {
        matched.push(p);
      }
    }

    ctx.matched = matched;

    let i = -1;
    const dispatch = async (n: number): Promise<void> => {
      if (n <= i) {
        throw new Error('next() called multiple times.');
      }

      i = n;

      const mw = this.patternMiddlewares[n];
      if (!mw) {
        for (const entry of matched) {
          entry.handler(ctx.event, ctx.payload);
          if (entry.once) {
            const idx = this.patterns.indexOf(entry);
            if (idx >= 0) {
              this.patterns.splice(idx, 1);
            }
          }
        }
        return;
      }

      await mw(ctx, () => dispatch(n + 1));
    };

    await dispatch(0);
  }

  private getExactSet<K extends keyof E>(event: K): Set<ExactHandler<E, K>> {
    let set = this.exact.get(event);

    if (!set) {
      set = new Set();
      this.exact.set(event, set);
    }

    return set;
  }

  private insertPatternSorted(entry: PatternEntryInternal<E>): void {
    let lo = 0;
    let hi = this.patterns.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.patterns[mid].priority >= entry.priority) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    this.patterns.splice(lo, 0, entry);
  }

  private matchPattern(entry: PatternEntryInternal<E>, event: keyof E): boolean {
    if (entry.kind === 'star') {
      return true;
    }

    if (typeof event !== 'string') {
      return false;
    }

    return event === entry.prefix || event.startsWith(entry.prefixWithColon!);
  }

  private parsePattern(p: string): { kind: 'prefix'; prefix: string } | { kind: 'star' } {
    if (p === '*') {
      return { kind: 'star' };
    }

    if (p.endsWith(':*')) {
      const prefix = p.slice(0, -2);

      if (!prefix) {
        throw new Error(`Invalid pattern: ${p}.`);
      }

      return { kind: 'prefix', prefix };
    }

    throw new Error(`Unsupported pattern: ${p}.`);
  }

  private async runMiddlewares<K extends keyof E>(ctx: EmitContext<E, K>): Promise<void> {
    let i = -1;

    const dispatch = async (n: number): Promise<void> => {
      if (ctx.blocked) {
        return;
      }

      if (n <= i) {
        throw new Error('next() called multiple times.');
      }

      i = n;

      const mw = this.middlewares[n];
      if (!mw) {
        this.callHandlers(ctx.event, ctx.payload);
        await this.callPatternHandlers(ctx);
        return;
      }

      await mw(ctx, () => dispatch(n + 1));
    };

    await dispatch(0);
  }
}
