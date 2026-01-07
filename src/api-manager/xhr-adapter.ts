import type {
  ApiRequest,
  ApiResponse,
  HttpAdapter,
  ResponseType,
  XHRAdapterConfig,
  XhrResponseType,
} from './types/api.ts';

import { prepareRequestBody, removeHeader } from './utils/helpers.ts';

/**
 * XHRAdapter.
 *
 * @author dafengzhen
 */
export class XHRAdapter implements HttpAdapter {
  private readonly config: XHRAdapterConfig;

  constructor(config: XHRAdapterConfig = {}) {
    this.config = {
      responseType: 'json',
      ...config,
    };
  }

  async send<T>(request: ApiRequest): Promise<ApiResponse<T>> {
    const xhr = new XMLHttpRequest();
    const desired = request.responseType ?? this.config.responseType;
    const normalizedHeaders = request.headers ? { ...request.headers } : {};
    const body = this.buildBody(request, normalizedHeaders);

    xhr.open(request.method, request.url, true);

    this.applyXhrOptions(xhr, request, desired);
    this.applyHeaders(xhr, normalizedHeaders);
    this.applyProgressHandlers(xhr, request);

    const cleanupAbort = this.bindAbortSignal(xhr, request.signal);

    try {
      return await new Promise<ApiResponse<T>>((resolve, reject) => {
        const cleanupAll = () => {
          cleanupAbort();
        };

        xhr.onload = async () => {
          try {
            const resHeaders = this.parseResponseHeaders(xhr.getAllResponseHeaders());
            const data = this.config.responseTransformer
              ? await this.config.responseTransformer<T>(xhr, request)
              : ((await this.extractResponseData<T>(xhr, resHeaders, desired)) as T);

            cleanupAll();
            resolve({
              data,
              headers: resHeaders,
              status: xhr.status,
              statusText: xhr.statusText,
            });
          } catch (e) {
            cleanupAll();
            reject(e);
          }
        };

        xhr.onerror = () => {
          cleanupAll();
          reject(new Error('Network error'));
        };

        xhr.ontimeout = () => {
          cleanupAll();
          reject(new Error(`Request timeout after ${xhr.timeout}ms.`));
        };

        xhr.onabort = () => {
          cleanupAll();
          reject(new Error('Request aborted'));
        };

        try {
          if (body === undefined) {
            xhr.send();
          } else {
            xhr.send(body as Document | null | undefined | XMLHttpRequestBodyInit);
          }
        } catch (e) {
          cleanupAll();
          reject(e);
        }
      });
    } finally {
      cleanupAbort();
    }
  }

  private applyHeaders(xhr: XMLHttpRequest, headers: Record<string, any>) {
    for (const [k, v] of Object.entries(headers)) {
      if (v !== null && v !== undefined) {
        xhr.setRequestHeader(k, String(v));
      }
    }
  }

  private applyProgressHandlers(xhr: XMLHttpRequest, request: ApiRequest) {
    if (this.config.onDownloadProgress) {
      xhr.onprogress = (evt) => this.config.onDownloadProgress?.(evt, request);
    }

    if (this.config.onUploadProgress) {
      xhr.upload.onprogress = (evt) => this.config.onUploadProgress?.(evt, request);
    }
  }

  private applyXhrOptions(xhr: XMLHttpRequest, request: ApiRequest, desired?: ResponseType) {
    if (this.config.withCredentials !== undefined) {
      xhr.withCredentials = this.config.withCredentials;
    }

    if (typeof request.timeout === 'number' && request.timeout > 0) {
      xhr.timeout = request.timeout;
    }

    xhr.responseType = this.mapResponseType(desired);
  }

  private bindAbortSignal(xhr: XMLHttpRequest, signal?: AbortSignal | null) {
    if (!signal) {
      return () => {};
    }

    const abortHandler = () => {
      try {
        xhr.abort();
      } catch {
        /* empty */
      }
    };

    if (signal.aborted) {
      abortHandler();
    } else {
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    return () => {
      signal.removeEventListener('abort', abortHandler);
    };
  }

  private buildBody(request: ApiRequest, headers: Record<string, any>) {
    const body = request.body ?? (request.data !== undefined ? prepareRequestBody(request.data, headers) : undefined);

    if (body instanceof FormData) {
      removeHeader(headers, 'content-type');
    }

    return body;
  }

  private async extractResponseData<T>(
    xhr: XMLHttpRequest,
    headers: Record<string, string>,
    desired?: ResponseType,
  ): Promise<T> {
    if (xhr.status === 204 || xhr.status === 205 || xhr.status === 304) {
      return undefined as T;
    }

    if (desired === 'arraybuffer' || desired === 'blob') {
      return xhr.response as T;
    }

    const text = typeof xhr.response === 'string' ? xhr.response : xhr.responseText;

    if (desired === 'text') {
      return text as unknown as T;
    }

    if (desired === 'formData') {
      const ct = (headers['content-type'] || '').toLowerCase();

      if (ct.includes('application/json') || ct.includes('+json')) {
        return this.tryParseJson<T>(text);
      }

      return text as unknown as T;
    }

    if (!text) {
      return undefined as T;
    }

    return this.tryParseJson<T>(text);
  }

  private mapResponseType(rt?: ResponseType): XhrResponseType {
    switch (rt) {
      case 'arraybuffer':
        return 'arraybuffer';
      case 'blob':
        return 'blob';
      case 'text':
        return 'text';
      case 'json':
      default:
        return 'text';
    }
  }

  private parseResponseHeaders(raw: string): Record<string, string> {
    const headers: Record<string, string> = {};
    if (!raw) {
      return headers;
    }

    for (const line of raw.trim().split(/[\r\n]+/)) {
      const idx = line.indexOf(':');
      if (idx <= 0) {
        continue;
      }

      const key = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      if (key) {
        headers[key] = value;
      }
    }

    return headers;
  }

  private tryParseJson<T>(text: string): T {
    try {
      return (text ? JSON.parse(text) : undefined) as T;
    } catch {
      return text as unknown as T;
    }
  }
}
