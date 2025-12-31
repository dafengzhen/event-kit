import type { APIManager } from './api-manager.ts';
import type { ApiRequest, ApiResponse } from './types.ts';

import { HttpMethod } from './types.ts';

/**
 * ApiRequestBuilder
 *
 * @author dafengzhen
 */
export class ApiRequestBuilder<TRes = any> {
  private readonly manager: APIManager;

  private readonly request: Partial<ApiRequest<any>> = {};

  constructor(manager: APIManager) {
    this.manager = manager;
  }

  abortSignal(signal: AbortSignal): this {
    this.request.abortSignal = signal;
    return this;
  }

  cache(ttl?: number): this {
    this.request.cacheOptions = {
      ...(this.request.cacheOptions ?? {}),
      ttl,
    };
    return this;
  }

  cacheKey(key: string): this {
    this.request.cacheKey = key;
    return this;
  }

  data<TReq = any>(data: TReq): this {
    this.request.data = data;
    return this;
  }

  delete(): Promise<ApiResponse<TRes>> {
    this.request.method = HttpMethod.DELETE;
    return this.send();
  }

  forceRefresh(): this {
    this.request.cacheOptions = {
      ...(this.request.cacheOptions ?? {}),
      forceRefresh: true,
    };
    return this;
  }

  get(): Promise<ApiResponse<TRes>> {
    this.request.method = HttpMethod.GET;
    return this.send();
  }

  header(key: string, value: string): this {
    if (!this.request.headers) {
      this.request.headers = {};
    }
    this.request.headers[key] = value;
    return this;
  }

  headers(headers: Record<string, string>): this {
    this.request.headers = {
      ...(this.request.headers ?? {}),
      ...headers,
    };
    return this;
  }

  maxRetries(maxRetries: number): this {
    this.request.retryOptions = {
      ...((this.request.retryOptions ?? {}) as any),
      maxRetries,
    };
    return this;
  }

  metadata(meta: Record<string, any>): this {
    this.request.metadata = {
      ...(this.request.metadata ?? ({} as any)),
      ...meta,
    };
    return this;
  }

  method(method: HttpMethod): this {
    this.request.method = method;
    return this;
  }

  noCache(): this {
    this.request.cacheOptions = {
      ...(this.request.cacheOptions ?? {}),
      ignoreCache: true,
    };
    return this;
  }

  param(key: string, value: unknown): this {
    if (!this.request.params) {
      this.request.params = {};
    }
    (this.request.params as any)[key] = value as any;
    return this;
  }

  params(params: Record<string, unknown>): this {
    this.request.params = {
      ...(this.request.params ?? ({} as any)),
      ...params,
    };
    return this;
  }

  patch<TReq = any>(data?: TReq): Promise<ApiResponse<TRes>> {
    this.request.method = HttpMethod.PATCH;
    if (data !== undefined) {
      this.request.data = data;
    }
    return this.send();
  }

  post<TReq = any>(data?: TReq): Promise<ApiResponse<TRes>> {
    this.request.method = HttpMethod.POST;
    if (data !== undefined) {
      this.request.data = data;
    }
    return this.send();
  }

  put<TReq = any>(data?: TReq): Promise<ApiResponse<TRes>> {
    this.request.method = HttpMethod.PUT;
    if (data !== undefined) {
      this.request.data = data;
    }
    return this.send();
  }

  responseType(type: ApiRequest['responseType']): this {
    this.request.responseType = type;
    return this;
  }

  retryOptions(opts: Record<string, any>): this {
    (this.request as any).retryOptions = {
      ...(((this.request as any).retryOptions ?? {}) as any),
      ...opts,
    };
    return this;
  }

  revalidateOnStale(enabled = true): this {
    this.request.cacheOptions = {
      ...(this.request.cacheOptions ?? {}),
      revalidateOnStale: enabled,
    };
    return this;
  }

  send(): Promise<ApiResponse<TRes>> {
    if (!this.request.url) {
      throw new Error('Request url is required.');
    }
    return this.manager.request<any, TRes>(this.request);
  }

  timeout(ms: number): this {
    this.request.timeout = ms;
    return this;
  }

  url(url: string): this {
    this.request.url = url;
    return this;
  }
}
