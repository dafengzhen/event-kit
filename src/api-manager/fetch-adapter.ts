import type { APIConfig, ApiRequest, ApiResponse, HttpAdapter } from './types.ts';

import { ApiError } from './api-error.ts';
import { HttpMethod } from './types.ts';

/**
 * FetchAdapter.
 *
 * @author dafengzhen
 */
export class FetchAdapter implements HttpAdapter {
  constructor(private readonly config: APIConfig) {}

  async send<T>(req: ApiRequest, signal: AbortSignal): Promise<ApiResponse<T>> {
    const start = performance.now();

    try {
      const fetchOptions = this.buildRequestInit(req, signal);
      const response = await fetch(req.url, fetchOptions);
      const duration = performance.now() - start;
      const headers = this.extractHeaders(response);
      const data = await this.parseResponse<T>(response, headers);

      return {
        config: this.config,
        data,
        duration,
        etag: headers['etag'],
        headers,
        id: req.id,
        lastModified: headers['last-modified'],
        request: req,
        retryCount: req.retryCount,
        status: response.status,
        statusText: response.statusText,
        timestamp: Date.now(),
      };
    } catch (error: unknown) {
      throw this.wrapError(error, req);
    }
  }

  private buildRequestInit(req: ApiRequest, signal: AbortSignal): RequestInit {
    const method = req.method;
    const headers = this.normalizeHeaders(req.headers);

    const init: RequestInit = {
      cache: this.config.fetchCache ?? 'no-store',
      headers,
      method,
      signal,
    };

    const canHaveBody = method !== HttpMethod.GET && method !== HttpMethod.HEAD;
    if (canHaveBody && req._body !== undefined) {
      init.body = req._body;
    }

    return init;
  }

  private extractHeaders(response: Response): Record<string, string> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return headers;
  }

  private normalizeHeaders(input: HeadersInit | undefined): Headers {
    return input instanceof Headers ? new Headers(input) : new Headers(input ?? {});
  }

  private async parseResponse<T>(response: Response, headers: Record<string, string>): Promise<T> {
    if (response.status === 204 || response.status === 205) {
      return undefined as any;
    }

    if (response.status === 304) {
      return undefined as any;
    }

    const contentType = (headers['content-type'] || '').toLowerCase();

    if (contentType.includes('application/json') || /\+json\b/i.test(contentType)) {
      const text = await response.text();
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
      return (await response.text()) as any;
    }

    if (contentType.startsWith('multipart/')) {
      return (await response.formData()) as any;
    }

    return (await response.arrayBuffer()) as any;
  }

  private wrapError(error: unknown, req: ApiRequest): ApiError {
    const err = error as any;

    const isAbort = err?.name === 'AbortError' || err?.code === 20 || err?.message?.includes?.('aborted');

    const isNetwork = err?.name === 'TypeError';

    const apiError = new ApiError({
      cause: error,
      code: isAbort ? 'CANCELED' : isNetwork ? 'NETWORK_ERROR' : '',
      request: req,
    });

    if (isAbort) {
      apiError.message = 'Request canceled';
    } else if (apiError.code === 'NETWORK_ERROR') {
      apiError.message = 'Network error';
    }

    return apiError;
  }
}
