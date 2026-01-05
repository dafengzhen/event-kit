import type { BaseEventDefinitions, EventWithPayload } from '../../core/types.ts';
import type { HttpMethod } from '../constants/http-method.ts';

export type ActiveRequestEntry = {
  controller?: AbortController;
  request: ApiRequest;
  timeoutId?: ReturnType<typeof setTimeout>;
};

export type AdapterFactory = ((config: APIConfig) => HttpAdapter) | HttpAdapter;

export interface APIConfig {
  adapter: AdapterFactory;
  baseURL?: string;
  defaultHeaders?: Record<string, string>;
  maxRedirects?: number;
  querySerializer?: QuerySerializer;
  timeout?: number;
  validateStatus?: (status?: number) => boolean;
  withCredentials?: boolean;
}

export interface ApiError {
  cause?: unknown;
  code: 'ERROR' | string;
  message?: string;
}

export interface ApiEvents extends BaseEventDefinitions {
  'api:end': EventWithPayload<{
    duration: number;
    request: ApiRequest;
    response?: ApiResponse;
    timestamp: number;
  }>;
  'api:error': EventWithPayload<{
    error: ApiError;
    request: ApiRequest;
    response?: ApiResponse;
    timestamp: number;
  }>;
  'api:start': EventWithPayload<{
    request: ApiRequest;
    timestamp: number;
  }>;
  'api:success': EventWithPayload<{
    duration: number;
    request: ApiRequest;
    response: ApiResponse;
    timestamp: number;
  }>;
  'api:timeout': EventWithPayload<{
    request: ApiRequest;
    timeout: number;
    timestamp: number;
  }>;
}

export interface ApiInterceptor<T = any> {
  onError?: (err: ApiError) => ApiError | Promise<ApiError>;
  onRequest?: (req: ApiRequest<T>) => ApiRequest<T> | Promise<ApiRequest<T>>;
  onResponse?: (res: ApiResponse<T>) => ApiResponse<T> | Promise<ApiResponse<T>>;
  weight?: number;
}

export interface ApiRequest<
  TData = any,
  TParams extends Record<string, QueryValue> = Record<string, QueryValue>,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  body?: BodyInit;
  cancellationToken?: CancellationToken;
  config?: APIConfig;
  data?: TData;
  headers?: Record<string, string>;
  meta?: TMeta;
  method: HttpMethod;
  params?: TParams;
  signal?: AbortSignal;
  timeout?: number;
  url: string;
  validateStatus?: (status?: number) => boolean;
}

export interface ApiResponse<TData = any, TMeta extends Record<string, unknown> = Record<string, unknown>> {
  config?: APIConfig;
  data?: TData;
  duration?: number;
  error?: ApiError;
  headers?: Record<string, string>;
  meta?: TMeta;
  request?: ApiRequest;
  status?: number;
  statusText?: string;
}

export interface CancellationToken {
  cancel: (reason?: string) => void;
  readonly isCancelled: boolean;
  readonly reason?: string;
  register: (callback: (reason?: string) => void) => void;
  throwIfCancelled: () => void;
}

export type ConfigMerger = (defaults: Partial<APIConfig>, overrides: Partial<APIConfig>) => APIConfig;

export interface HttpAdapter {
  send: <T>(req: ApiRequest) => Promise<ApiResponse<T>>;
}

export interface InterceptorManager {
  clear: () => void;
  eject: (interceptor: ApiInterceptor) => void;
  getInterceptors: () => ApiInterceptor[];
  use: <T = any>(interceptor: ApiInterceptor<T>) => () => void;
}

export type QueryPrimitive = boolean | null | number | string | undefined;

export interface QuerySerializer {
  serialize: (params: Record<string, QueryValue>) => string;
}

export type QueryValue =
  | Date
  | QueryPrimitive
  | QueryPrimitive[]
  | { [key: string]: QueryPrimitive | QueryPrimitive[] };

export type SerializeOptions = {
  arrayFormat?: 'brackets' | 'repeat';
  skipEmptyString?: boolean;
};

export type URLBuilder = (baseURL: string, path: string, params?: Record<string, QueryValue>) => string;
