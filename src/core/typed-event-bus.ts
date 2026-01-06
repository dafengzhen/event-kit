import type {
  AnyHandler,
  EmitContext,
  EventMapBase,
  ExactHandler,
  Handler,
  MatchKeys,
  Middleware,
  Pattern,
  PrefixHandler,
  StarHandler,
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

  private prefixHandlers = new Map<string, Set<PrefixHandler<E>>>();

  private starHandlers = new Set<StarHandler<E>>();

  clear(event?: keyof E): void {
    if (event === undefined) {
      this.exact.clear();
      this.anyHandlers.clear();
      this.starHandlers.clear();
      this.prefixHandlers.clear();
      this.middlewares.length = 0;
      return;
    }

    this.exact.delete(event);
  }

  emit<K extends keyof E>(event: K, ...args: E[K] extends void ? [] : [payload: E[K]]): void {
    const payload = (args[0] as E[K]) ?? (undefined as E[K]);
    const ctx: EmitContext<E, K> = { event, meta: undefined, payload };

    this.runMiddlewares(ctx).catch((err) => {
      queueMicrotask(() => {
        throw err;
      });
    });
  }

  async emitAsync<K extends keyof E>(event: K, ...args: E[K] extends void ? [] : [payload: E[K]]): Promise<void> {
    const payload = (args[0] as E[K]) ?? (undefined as E[K]);
    const ctx: EmitContext<E, K> = { event, meta: undefined, payload };
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

    set.delete(handler as ExactHandler<E, K>);

    if (set.size === 0) {
      this.exact.delete(event);
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

  onPattern<P extends Pattern<Extract<keyof E, string>>>(
    pattern: P,
    handler: <K extends keyof E & MatchKeys<Extract<keyof E, string>, P>>(event: K, payload: E[K]) => void,
  ): () => void {
    const info = this.parsePattern(pattern);

    if (info.kind === 'star') {
      const h = handler as unknown as StarHandler<E>;
      this.starHandlers.add(h);
      return () => this.starHandlers.delete(h);
    }

    const h = handler as unknown as PrefixHandler<E>;
    const set = this.getPrefixSet(info.prefix);
    set.add(h);

    return () => {
      const s = this.prefixHandlers.get(info.prefix);
      if (!s) {
        return;
      }

      s.delete(h);

      if (s.size === 0) {
        this.prefixHandlers.delete(info.prefix);
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

  private callHandlers<K extends keyof E>(event: K, payload: E[K]): void {
    // exact
    const set = this.exact.get(event) as Set<ExactHandler<E, K>> | undefined;
    if (set?.size) {
      for (const fn of Array.from(set)) {
        try {
          fn(payload);
        } catch (e) {
          queueMicrotask(() => {
            throw e;
          });
        }
      }
    }

    // any
    if (this.anyHandlers.size) {
      for (const fn of Array.from(this.anyHandlers)) {
        try {
          fn(event, payload);
        } catch (e) {
          queueMicrotask(() => {
            throw e;
          });
        }
      }
    }

    // star
    if (this.starHandlers.size) {
      for (const fn of Array.from(this.starHandlers)) {
        try {
          fn(event, payload);
        } catch (e) {
          queueMicrotask(() => {
            throw e;
          });
        }
      }
    }

    // prefix
    if (typeof event === 'string') {
      const idx = event.indexOf(':');
      if (idx > 0) {
        const prefix = event.slice(0, idx);
        const set = this.prefixHandlers.get(prefix);
        if (set?.size) {
          for (const fn of Array.from(set)) {
            try {
              fn(event, payload);
            } catch (e) {
              queueMicrotask(() => {
                throw e;
              });
            }
          }
        }
      }
    }
  }

  private getExactSet<K extends keyof E>(event: K): Set<ExactHandler<E, K>> {
    let set = this.exact.get(event);

    if (!set) {
      set = new Set();
      this.exact.set(event, set as any);
    }

    return set;
  }

  private getPrefixSet(prefix: string): Set<PrefixHandler<E>> {
    let set = this.prefixHandlers.get(prefix);

    if (!set) {
      set = new Set();
      this.prefixHandlers.set(prefix, set);
    }

    return set;
  }

  private parsePattern(p: string): { kind: 'prefix'; prefix: string } | { kind: 'star' } {
    if (p === '*') {
      return { kind: 'star' };
    }

    if (p.length >= 3 && p.endsWith(':*')) {
      const prefix = p.slice(0, -2);

      if (prefix.length === 0) {
        throw new Error(`Unsupported pattern: ${p}. Prefix cannot be empty.`);
      }

      return { kind: 'prefix', prefix };
    }

    throw new Error(`Unsupported pattern: ${p}. Only '*' or 'prefix:*' is supported.`);
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
        return;
      }

      await mw(ctx as any, () => dispatch(n + 1));
    };

    await dispatch(0);
  }
}
