import type { EventMapBase } from '../../core/types.ts';
import type { ApiError } from '../api-error.ts';
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
  querySerializer?: QuerySerializer;
  timeout?: number;
  validateStatus?: (status?: number) => boolean;
}

export type ApiErrorCode = string;

export interface ApiErrorContext {
  extra?: Record<string, unknown>;
  method?: string;
  requestId?: string;
  status?: number;
  statusText?: string;
  traceId?: string;
  url?: string;
}

export type ApiEvents = EventMapBase & {
  'api:end': {
    duration: number;
    request: ApiRequest;
    response?: ApiResponse;
    timestamp: number;
  };
  'api:error': {
    error: ApiError;
    request: ApiRequest;
    response?: ApiResponse;
    timestamp: number;
  };
  'api:start': {
    request: ApiRequest;
    timestamp: number;
  };
  'api:success': {
    duration: number;
    request: ApiRequest;
    response: ApiResponse;
    timestamp: number;
  };
  'api:timeout': {
    request: ApiRequest;
    timeout: number;
    timestamp: number;
  };
};

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
  responseType?: ResponseType;
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

export interface FetchAdapterConfig extends RequestInit {
  responseTransformer?: <T>(response: Response, request: ApiRequest) => Promise<T>;
  responseType?: ResponseType;
}

export interface HttpAdapter {
  send: <T>(request: ApiRequest) => Promise<ApiResponse<T>>;
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

export type ResponseType = 'arraybuffer' | 'blob' | 'formData' | 'json' | 'text';

export type SerializeOptions = {
  arrayFormat?: 'brackets' | 'repeat';
  skipEmptyString?: boolean;
};

export interface XHRAdapterConfig {
  onDownloadProgress?: (evt: ProgressEvent<EventTarget>, request: ApiRequest) => void;
  onUploadProgress?: (evt: ProgressEvent<EventTarget>, request: ApiRequest) => void;
  responseTransformer?: <T>(xhr: XMLHttpRequest, request: ApiRequest) => Promise<T> | T;
  responseType?: ResponseType;
  withCredentials?: boolean;
}

export type XhrResponseType = '' | 'arraybuffer' | 'blob' | 'document' | 'json' | 'text';
