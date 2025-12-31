export interface AbortOptions {
  onCancel: () => void;
  signal?: AbortSignal;
}

export type AbortReason = 'outer' | 'timeout';

export interface BaseEventDefinition<P = undefined> {
  payload: P;
}

export interface BaseEventDefinitions {
  [eventName: string]: BaseEventDefinition<unknown>;
}

export type BaseOptions = AbortOptions & LifecycleOptions & RetryOptions & TimeoutOptions;

export interface CompiledPatternListenerEntry<T extends BaseEventDefinitions> extends PatternListenerEntry<T> {
  re: RegExp;
}

export type EmitOptions = Partial<BaseOptions>;

export type EventListener<T extends BaseEventDefinitions, K extends EventName<T>> = (
  payload: EventPayload<T, K>,
) => Promise<void>;

export type EventMiddleware<T extends BaseEventDefinitions> = (
  ctx: MiddlewareContext<T>,
  next: () => Promise<void>,
) => Promise<void>;

export type EventName<T extends BaseEventDefinitions> = Extract<keyof T, string>;

export type EventPayload<T extends BaseEventDefinitions, K extends EventName<T>> = T[K]['payload'];

export type EventPlainObject = Record<string, unknown>;

export type EventState = 'cancelled' | 'failed' | 'pending' | 'retrying' | 'running' | 'succeeded' | 'timeout';

export type EventWithPayload<P> = BaseEventDefinition<P>;

export type ExecOptions = BaseOptions;

export interface ExecutorContext {
  attemptIndex: number;
  retryCount: number;
  signal: AbortSignal;
}

export interface ExecutorEvent {
  attemptIndex: number;
  error?: unknown;
  retryCount: number;
  state: EventState;
}

export interface LifecycleOptions {
  onStateChange: (e: ExecutorEvent) => void;
  throwOnError: boolean;
}

export interface ListenerEntry<T extends BaseEventDefinitions, K extends EventName<T>> {
  eventName: EventName<T>;
  listener: EventListener<T, K>;
  once?: boolean;
  priority?: number;
}

export interface ListenerOptions {
  once?: boolean;
  priority?: number;
}

export interface MiddlewareContext<T extends BaseEventDefinitions> {
  eventName: EventName<T>;
  options?: ExecOptions;
  payload?: EventPayload<T, EventName<T>>;
  state: EventPlainObject;
}

export interface MiddlewareSupport<T extends BaseEventDefinitions> {
  use(middleware: EventMiddleware<T>): () => void;
}

export type OnceOptions = Omit<OnOptions, 'once'>;

export type OnOptions = ListenerOptions;

export interface PatternListenerEntry<T extends BaseEventDefinitions> {
  cache?: Map<string, RegExp>;
  flags?: string;
  listener: EventListener<T, any>;
  once?: boolean;
  pattern: string;
  priority?: number;
  separator?: string;
}

export interface PatternOptions extends OnOptions {
  cache?: Map<string, RegExp>;
  flags?: string;
  separator?: string;
}

export type RetryDelay = ((ctx: { attemptIndex: number; error: unknown; retryCount: number }) => number) | number;

export interface RetryOptions {
  maxRetries: number;
  onRetryAttempt: (e: { attemptIndex: number; error: unknown; retryCount: number }) => void;
  retryDelay: RetryDelay;
  shouldRetry: (ctx: { attemptIndex: number; error: unknown; retryCount: number }) => boolean;
}

export interface Support<T extends BaseEventDefinitions> {
  destroy(): void;

  emit<K extends EventName<T>>(eventName: K, payload?: EventPayload<T, K>, options?: EmitOptions): Promise<void>;

  off<K extends EventName<T>>(eventName: K, listener: EventListener<T, K>): void;

  on<K extends EventName<T>>(eventName: K, listener: EventListener<T, K>, options?: OnOptions): () => void;

  once<K extends EventName<T>>(eventName: K, listener: EventListener<T, K>, options?: OnceOptions): () => void;
}

export interface TimeoutOptions {
  onTimeout: (timeoutMs: number) => void;
  timeoutMs: number;
}

export interface WildcardCompileOptions extends OnOptions {
  cache?: Map<string, RegExp>;
  flags?: string;
  separator?: string;
}

export interface WildcardSupport<T extends BaseEventDefinitions> {
  match(pattern: string, listener: EventListener<T, any>, options?: OnOptions): () => void;

  matchOnce(pattern: string, listener: EventListener<T, any>, options?: OnceOptions): () => void;

  unmatch(pattern: string, listener: EventListener<T, any>): void;
}
