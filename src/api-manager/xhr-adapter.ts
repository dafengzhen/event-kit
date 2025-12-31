import type { APIConfig, ApiRequest, ApiResponse, HttpAdapter } from './types.ts';

import { ApiError } from './api-error.ts';
import { HttpMethod } from './types.ts';

/**
 * XHRAdapter.
 *
 * @author dafengzhen
 */
export class XHRAdapter implements HttpAdapter {
  constructor(private readonly config: APIConfig) {}

  send<T>(req: ApiRequest, signal: AbortSignal): Promise<ApiResponse<T>> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(this.createCanceledError(req, 'Request canceled'));
        return;
      }

      const xhr = new XMLHttpRequest();
      const startTime = performance.now();
      const timeout = req.timeout ?? this.config.timeout ?? 30000;

      const onAbort = () => {
        try {
          xhr.abort();
        } finally {
          cleanup();
          reject(this.createCanceledError(req, 'Request canceled'));
        }
      };

      const cleanup = () => {
        signal.removeEventListener('abort', onAbort);
        xhr.onload = null;
        xhr.onerror = null;
        xhr.ontimeout = null;
        xhr.onabort = null;
        xhr.onreadystatechange = null;
      };

      signal.addEventListener('abort', onAbort, { once: true });

      try {
        xhr.open(req.method, req.url, true);
      } catch (e) {
        cleanup();
        reject(
          new ApiError({
            cause: e,
            code: 'REQUEST_SEND_FAILED',
            request: req,
          }),
        );
        return;
      }

      xhr.timeout = timeout;

      const rt = (req as any).responseType as 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | undefined;

      xhr.responseType = rt ?? 'text';

      this.applyHeaders(xhr, req.headers);

      xhr.onabort = () => {
        cleanup();
        reject(this.createCanceledError(req, 'Request canceled'));
      };

      xhr.onerror = () => {
        cleanup();
        reject(this.createNetworkError(req, 'Network error'));
      };

      xhr.ontimeout = () => {
        cleanup();
        reject(
          new ApiError({
            code: 'TIMEOUT',
            request: req,
          }),
        );
      };

      xhr.onload = () => {
        cleanup();

        if (xhr.status === 0) {
          if (signal.aborted || xhr.readyState !== 4) {
            reject(this.createCanceledError(req, 'Request canceled'));
          } else {
            reject(this.createNetworkError(req, 'Network error'));
          }
          return;
        }

        const response = this.buildResponse<T>(xhr, req, startTime);

        if (xhr.status < 200 || xhr.status >= 300) {
          reject(
            new ApiError({
              code: `HTTP_${xhr.status}`,
              request: req,
              response,
              status: xhr.status,
            }),
          );
          return;
        }

        resolve(response);
      };

      try {
        xhr.send(this.resolveBody(req));
      } catch (error) {
        cleanup();
        reject(
          new ApiError({
            cause: error,
            code: 'REQUEST_SEND_FAILED',
            request: req,
          }),
        );
      }
    });
  }

  private applyHeaders(xhr: XMLHttpRequest, headers?: Record<string, unknown>): void {
    if (!headers) {
      return;
    }

    for (const [key, value] of Object.entries(headers)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }
      xhr.setRequestHeader(key, String(value));
    }
  }

  private buildResponse<T>(xhr: XMLHttpRequest, req: ApiRequest, startTime: number): ApiResponse<T> {
    const headers = this.parseHeaders(xhr.getAllResponseHeaders());

    return {
      config: this.config,
      data: this.parseResponse<T>(xhr, headers),
      duration: performance.now() - startTime,
      etag: headers['etag'],
      headers,
      id: req.id,
      lastModified: headers['last-modified'],
      request: req,
      retryCount: req.retryCount,
      status: xhr.status,
      statusText: xhr.statusText,
      timestamp: Date.now(),
    };
  }

  private createCanceledError(req: ApiRequest, message?: string): ApiError {
    const err = new ApiError({
      code: 'CANCELED',
      request: req,
    });
    if (message) {
      err.message = message;
    }
    return err;
  }

  private createNetworkError(req: ApiRequest, message?: string): ApiError {
    const err = new ApiError({
      code: 'NETWORK_ERROR',
      request: req,
    });
    if (message) {
      err.message = message;
    }
    return err;
  }

  private parseHeaders(raw: string): Record<string, string> {
    const headers: Record<string, string> = {};
    if (!raw) {
      return headers;
    }

    raw
      .trim()
      .split(/[\r\n]+/)
      .forEach((line) => {
        const index = line.indexOf(':');
        if (index > -1) {
          const key = line.slice(0, index).trim().toLowerCase();
          headers[key] = line.slice(index + 1).trim();
        }
      });

    return headers;
  }

  private parseResponse<T>(xhr: XMLHttpRequest, headers: Record<string, string>): T {
    if (xhr.status === 204 || xhr.status === 205 || xhr.status === 304) {
      return undefined as any;
    }

    const contentType = (headers['content-type'] ?? '').toLowerCase();

    const rt = xhr.responseType;

    if (rt === 'blob' || rt === 'arraybuffer' || rt === 'document') {
      return xhr.response as any as T;
    }

    const text = xhr.responseText ?? '';

    const isJson = contentType.includes('application/json') || /\+json\b/i.test(contentType);

    if (isJson) {
      if (!text) {
        return undefined as any;
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as any;
      }
    }

    if (contentType.startsWith('text/')) {
      return text as any;
    }

    return ((xhr.response as any) ?? (text as any)) as T;
  }

  private resolveBody(req: ApiRequest): null | XMLHttpRequestBodyInit {
    if (req.method === HttpMethod.GET || req.method === HttpMethod.HEAD) {
      return null;
    }
    return (req._body ?? null) as null | XMLHttpRequestBodyInit;
  }
}
