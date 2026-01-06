export type AnyHandler<E extends EventMapBase> = <K extends keyof E>(event: K, payload: E[K]) => void;

export type EmitContext<E extends EventMapBase, K extends keyof E> = {
  blocked?: boolean;
  event: K;
  meta?: Record<string, unknown>;
  payload: E[K];
};

export type EventMapBase = Record<string, unknown>;

export type ExactHandler<E extends EventMapBase, K extends keyof E> = (payload: E[K]) => void;

export type Handler<Payload> = Payload extends void ? () => void : (payload: Payload) => void;

export type MatchKeys<Keys extends string, P extends Pattern<Keys>> = P extends '*'
  ? Keys
  : P extends `${infer Prefix}:*`
    ? Extract<Keys, `${Prefix}:${string}`>
    : never;

export type Middleware<E extends EventMapBase> = <K extends keyof E>(
  ctx: EmitContext<E, K>,
  next: () => Promise<void>,
) => Promise<void> | void;

export type Pattern<_K extends string> = '*' | `${string}:*`;

export type PrefixHandler<E extends EventMapBase> = <K extends keyof E>(event: K, payload: E[K]) => void;

export type StarHandler<E extends EventMapBase> = <K extends keyof E>(event: K, payload: E[K]) => void;
