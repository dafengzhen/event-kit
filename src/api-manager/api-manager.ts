import type {
  ActiveRequestEntry,
  AdapterFactory,
  APIConfig,
  ApiErrorCode,
  ApiErrorContext,
  ApiEvents,
  ApiInterceptor,
  ApiRequest,
  ApiResponse,
  CancellationToken,
  HttpAdapter,
  QueryValue,
} from './types/api.ts';

import { TypedEventBus } from '../core/index.ts';
import { ApiError } from './api-error.ts';
import { DEFAULT_CONFIG } from './constants/default-config.ts';
import { HttpMethod } from './constants/http-method.ts';
import { buildURL, buildURLWithParams } from './utils/helpers.ts';

/**
 * APIManager.
 *
 * @author dafengzhen
 */
export class APIManager {
  private activeRequests: Map<string, ActiveRequestEntry> = new Map();

  private adapter: HttpAdapter;

  private config: APIConfig;

  private eventEmitter = new TypedEventBus<ApiEvents>();

  private interceptors: ApiInterceptor[] = [];

  private requestCounter = 0;

  constructor(config: APIConfig) {
    this.config = this.normalizeConfig(config);
    this.adapter = this.createAdapter(this.config.adapter);
  }

  static create(config: Partial<APIConfig> & { adapter: AdapterFactory }): APIManager {
    return new APIManager(config as APIConfig);
  }

  buildFullURL(path: string = '', params?: Record<string, QueryValue>): string {
    const baseURL = this.config.baseURL || '';

    if (params && Object.keys(params).length > 0) {
      return buildURLWithParams(baseURL, path, params, this.config.querySerializer);
    }

    const url = buildURL(baseURL, path);

    if (!url) {
      throw this.createApiError('ERROR', 'Request url is required.', undefined, { url });
    }

    return url;
  }

  cancelAllRequests(reason?: string): void {
    for (const [requestId, _entry] of this.activeRequests) {
      this.cancelRequest(requestId, reason);
    }
  }

  cancelRequest(requestId: string, reason?: string): boolean {
    const activeRequest = this.activeRequests.get(requestId);
    if (!activeRequest) {
      return false;
    }

    const { controller, request, timeoutId } = activeRequest;

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (controller) {
      controller.abort(reason);
    }

    if (request.cancellationToken) {
      request.cancellationToken.cancel(reason);
    }

    this.activeRequests.delete(requestId);
    return true;
  }

  clearInterceptors(): void {
    this.interceptors = [];
  }

  createCancellationToken(): CancellationToken {
    return new CancellationTokenImpl();
  }

  async delete<T = any>(url: string, config?: Omit<Partial<ApiRequest<T>>, 'method' | 'url'>): Promise<ApiResponse<T>> {
    return this.request({ method: HttpMethod.DELETE, url, ...config });
  }

  async get<T = any, TParams extends Record<string, QueryValue> = Record<string, QueryValue>>(
    url: string,
    config?: Omit<Partial<ApiRequest<T, TParams>>, 'method' | 'url'>,
  ): Promise<ApiResponse<T>> {
    return this.request({ method: HttpMethod.GET, url, ...config });
  }

  getActiveRequestCount(): number {
    return this.activeRequests.size;
  }

  getActiveRequestIds(): string[] {
    return Array.from(this.activeRequests.keys());
  }

  getConfig(): APIConfig {
    return { ...this.config };
  }

  getInterceptors(): ApiInterceptor[] {
    return [...this.interceptors];
  }

  off<K extends keyof ApiEvents>(event: K, listener: (payload: ApiEvents[K]) => void): void {
    this.eventEmitter.off(event as string, listener as any);
  }

  on<K extends keyof ApiEvents>(event: K, listener: (payload: ApiEvents[K]) => void): () => void {
    return this.eventEmitter.on(event as string, listener as any);
  }

  once<K extends keyof ApiEvents>(event: K, listener: (payload: ApiEvents[K]) => void): () => void {
    return this.eventEmitter.once(event as string, listener as any);
  }

  async patch<T = any>(
    url: string,
    data?: any,
    config?: Omit<Partial<ApiRequest<T>>, 'data' | 'method' | 'url'>,
  ): Promise<ApiResponse<T>> {
    return this.request({ data, method: HttpMethod.PATCH, url, ...config });
  }

  async post<T = any>(
    url: string,
    data?: any,
    config?: Omit<Partial<ApiRequest<T>>, 'data' | 'method' | 'url'>,
  ): Promise<ApiResponse<T>> {
    return this.request({ data, method: HttpMethod.POST, url, ...config });
  }

  async put<T = any>(
    url: string,
    data?: any,
    config?: Omit<Partial<ApiRequest<T>>, 'data' | 'method' | 'url'>,
  ): Promise<ApiResponse<T>> {
    return this.request({ data, method: HttpMethod.PUT, url, ...config });
  }

  async request<T = any, TParams extends Record<string, QueryValue> = Record<string, QueryValue>>(
    request: Partial<ApiRequest<T, TParams>>,
  ): Promise<ApiResponse<T>> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();

    const prepared = this.prepareRequest(request, requestId);
    const fullRequest = prepared.request;

    try {
      if (fullRequest.cancellationToken) {
        fullRequest.cancellationToken.throwIfCancelled();
      }

      this.emit('api:start', { request: fullRequest, timestamp: startTime });

      this.storeActiveRequest(requestId, fullRequest, prepared.controller, prepared.timeoutId);

      const processedRequest = await this.executeRequestInterceptors(fullRequest);
      const response = await this.adapter.send<T>(processedRequest);

      const duration = Date.now() - startTime;
      const responseWithDuration: ApiResponse<T> = {
        ...response,
        duration,
        request: processedRequest,
      };

      const processedResponse = await this.executeResponseInterceptors(responseWithDuration);
      const isValid = this.validateResponse(processedResponse, processedRequest);

      if (isValid) {
        this.emit('api:success', {
          duration,
          request: processedRequest,
          response: processedResponse,
          timestamp: Date.now(),
        });
      } else {
        const error = this.createApiError(
          'ERROR',
          `Request failed with status code ${processedResponse.status}.`,
          undefined,
          {
            method: processedRequest.method,
            requestId: processedRequest.meta?.requestId as string | undefined,
            status: processedResponse.status,
            statusText: processedResponse.statusText,
            url: processedRequest.url,
          },
        );
        const errorResponse: ApiResponse<T> = { ...processedResponse, error };

        this.emit('api:error', {
          error,
          request: processedRequest,
          response: errorResponse,
          timestamp: Date.now(),
        });
      }

      this.emit('api:end', { duration, request: processedRequest, response: processedResponse, timestamp: Date.now() });

      this.removeActiveRequest(requestId);

      return processedResponse;
    } catch (e) {
      const duration = Date.now() - startTime;
      const error = this.createApiError('ERROR', undefined, e, {
        extra: { duration },
        method: fullRequest.method,
        requestId: fullRequest.meta?.requestId as string | undefined,
        url: fullRequest.url,
      });

      const errorResponse: ApiResponse<T> = {
        config: this.config,
        duration,
        error,
        request: fullRequest,
      };

      this.emit('api:error', {
        error,
        request: fullRequest,
        response: errorResponse,
        timestamp: Date.now(),
      });

      this.emit('api:end', {
        duration,
        request: fullRequest,
        response: errorResponse,
        timestamp: Date.now(),
      });

      this.removeActiveRequest(requestId);

      throw error;
    }
  }

  resetConfig(): void {
    this.config = this.normalizeConfig({
      ...DEFAULT_CONFIG,
      adapter: this.config.adapter,
    });
  }

  updateConfig(config: Partial<APIConfig>): void {
    this.config = this.normalizeConfig({ ...this.config, ...config });

    if (config.adapter) {
      this.adapter = this.createAdapter(config.adapter);
    }
  }

  useInterceptor<T = any>(interceptor: ApiInterceptor<T>): () => void {
    this.interceptors.push(interceptor);

    return () => {
      const idx = this.interceptors.indexOf(interceptor);
      if (idx >= 0) {
        this.interceptors.splice(idx, 1);
      }
    };
  }

  private createAdapter(adapterFactory: AdapterFactory): HttpAdapter {
    return typeof adapterFactory === 'function' ? adapterFactory(this.config) : adapterFactory;
  }

  private createApiError(code: ApiErrorCode, message?: string, cause?: unknown, context?: ApiErrorContext): ApiError {
    const derivedMessage =
      (message ?? (cause instanceof Error ? cause.message : cause != null ? String(cause) : '')) || 'Unknown API error';

    return new ApiError(code, derivedMessage, { cause, context });
  }

  private emit<K extends keyof ApiEvents>(event: K, payload: ApiEvents[K]): void {
    void this.eventEmitter.emit(event as string, payload);
  }

  private async executeRequestInterceptors<T>(request: ApiRequest<T>): Promise<ApiRequest<T>> {
    let processedRequest = request;

    const sortedInterceptors = [...this.interceptors].sort((a, b) => (b.weight || 0) - (a.weight || 0));

    for (const interceptor of sortedInterceptors) {
      if (interceptor.onRequest) {
        processedRequest = await interceptor.onRequest(processedRequest);
      }
    }

    return processedRequest;
  }

  private async executeResponseInterceptors<T>(response: ApiResponse<T>): Promise<ApiResponse<T>> {
    let processedResponse = response;

    const sortedInterceptors = [...this.interceptors].sort((a, b) => (a.weight || 0) - (b.weight || 0));

    for (const interceptor of sortedInterceptors) {
      if (interceptor.onResponse) {
        processedResponse = await interceptor.onResponse(processedResponse);
      }
    }

    return processedResponse;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${++this.requestCounter}`;
  }

  private isSuccessStatus(status?: number): boolean {
    return typeof status === 'number' && status >= 200 && status < 300;
  }

  private normalizeConfig(config: APIConfig): APIConfig {
    return {
      ...DEFAULT_CONFIG,
      ...config,
      defaultHeaders: {
        ...DEFAULT_CONFIG.defaultHeaders,
        ...config.defaultHeaders,
      },
    };
  }

  private prepareRequest<T>(
    request: Partial<ApiRequest<T>>,
    requestId: string,
  ): {
    controller?: AbortController;
    request: ApiRequest<T>;
    timeoutId?: ReturnType<typeof setTimeout>;
  } {
    const mergedRequest = {
      ...request,
      config: this.config,
      headers: {
        ...this.config.defaultHeaders,
        ...request.headers,
      },
      meta: { ...(request.meta || {}), requestId },
      url: this.buildFullURL(request.url),
    } as ApiRequest<T>;

    let controller: AbortController | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (!mergedRequest.signal && mergedRequest.timeout) {
      controller = new AbortController();
      mergedRequest.signal = controller.signal;

      if (mergedRequest.timeout > 0) {
        timeoutId = setTimeout(() => {
          controller?.abort(`Request timeout after ${mergedRequest.timeout}ms.`);
          this.emit('api:timeout', {
            request: mergedRequest,
            timeout: mergedRequest.timeout!,
            timestamp: Date.now(),
          });
        }, mergedRequest.timeout);
      }
    }

    return { controller, request: mergedRequest, timeoutId };
  }

  private removeActiveRequest(requestId: string): void {
    const entry = this.activeRequests.get(requestId);

    if (entry?.timeoutId) {
      clearTimeout(entry.timeoutId);
    }

    this.activeRequests.delete(requestId);
  }

  private storeActiveRequest(
    requestId: string,
    request: ApiRequest,
    controller?: AbortController,
    timeoutId?: ReturnType<typeof setTimeout>,
  ): void {
    this.activeRequests.set(requestId, { controller, request, timeoutId });
  }

  private validateResponse<T>(response: ApiResponse<T>, request: ApiRequest<T>): boolean {
    const validateStatus = request.validateStatus || this.config.validateStatus;

    if (validateStatus) {
      return validateStatus(response.status);
    }

    return this.isSuccessStatus(response.status);
  }
}

/**
 * CancellationTokenImpl.
 *
 * @author dafengzhen
 */
export class CancellationTokenImpl implements CancellationToken {
  get isCancelled(): boolean {
    return this._isCancelled;
  }

  get reason(): string | undefined {
    return this._reason;
  }

  private _isCancelled = false;

  private _reason?: string;

  private callbacks: Array<(reason?: string) => void> = [];

  cancel(reason?: string): void {
    if (this._isCancelled) {
      return;
    }

    this._isCancelled = true;
    this._reason = reason;
    const cbs = this.callbacks;
    this.callbacks = [];
    cbs.forEach((cb) => cb(reason));
  }

  register(callback: (reason?: string) => void): void {
    if (this._isCancelled) {
      callback(this._reason);
    } else {
      this.callbacks.push(callback);
    }
  }

  throwIfCancelled(): void {
    if (this._isCancelled) {
      throw new Error(`Request cancelled: ${this._reason || 'No reason provided'}.`);
    }
  }
}
