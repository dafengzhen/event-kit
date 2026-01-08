import type { ApiRequest, ApiResponse, FetchAdapterConfig, HttpAdapter, ResponseType } from './types/api.ts';

import { prepareRequestBody } from './utils/helpers.ts';

/**
 * FetchAdapter.
 *
 * @author dafengzhen
 */
export class FetchAdapter implements HttpAdapter {
  private readonly config: FetchAdapterConfig;

  constructor(config: FetchAdapterConfig = {}) {
    this.config = {
      responseType: 'json',
      ...config,
    };
  }

  async send<T>(request: ApiRequest): Promise<ApiResponse<T>> {
    const requestInit = await this.buildRequestInitFromRequest(request);
    const response = await fetch(request.url, requestInit);
    return await this.handleResponse<T>(response, request);
  }

  private async buildRequestInitFromRequest(request: ApiRequest): Promise<RequestInit> {
    const { body, data, headers, method, signal } = request;

    const normalizedHeaders = headers ? { ...headers } : undefined;

    let requestBody: BodyInit | undefined;

    if (body !== undefined) {
      requestBody = body;
    } else if (data !== undefined) {
      requestBody = prepareRequestBody(data, normalizedHeaders || {});
    }

    const requestInit: RequestInit = {
      ...this.pickFetchInit(this.config),
    };

    if (method !== undefined) {
      requestInit.method = method;
    }

    if (normalizedHeaders !== undefined) {
      requestInit.headers = normalizedHeaders;
    }

    if (requestBody !== undefined) {
      requestInit.body = requestBody;
    }

    if (signal) {
      requestInit.signal = signal;
    }

    return requestInit;
  }

  private determineResponseType(contentType: string): ResponseType {
    const ct = (contentType || '').toLowerCase();

    if (ct.includes('application/json') || ct.includes('+json')) {
      return 'json';
    }

    if (ct.includes('multipart/form-data')) {
      return 'formData';
    }

    if (ct.startsWith('image/') || ct.includes('application/octet-stream')) {
      return 'blob';
    }

    if (ct.startsWith('text/')) {
      return 'text';
    }

    return 'text';
  }

  private async extractResponseData<T>(response: Response, responseType?: ResponseType): Promise<T> {
    const contentType = response.headers.get('content-type') || '';
    const actualType = responseType || this.determineResponseType(contentType);

    switch (actualType) {
      case 'arraybuffer':
        return (await response.arrayBuffer()) as T;
      case 'blob':
        return (await response.blob()) as T;
      case 'formData':
        return (await response.formData()) as T;
      case 'text':
        return (await response.text()) as T;
      case 'json':
      default: {
        const text = await response.text();
        if (!text) {
          return undefined as T;
        }

        try {
          return JSON.parse(text) as T;
        } catch {
          return text as unknown as T;
        }
      }
    }
  }

  private async handleResponse<T>(response: Response, request: ApiRequest): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let data: T = undefined as T;

    if (!this.shouldSkipBodyParsing(response, request)) {
      if (this.config.responseTransformer) {
        data = await this.config.responseTransformer<T>(response, request);
      } else {
        const responseType = request.responseType || this.config.responseType;
        data = await this.extractResponseData<T>(response, responseType);
      }
    }

    return {
      data,
      headers,
      originalResponse: response,
      status: response.status,
      statusText: response.statusText,
    };
  }

  private pickFetchInit(config: FetchAdapterConfig): RequestInit {
    const { responseTransformer: _responseTransformer, responseType: _responseType, ...rest } = config;
    return rest;
  }

  private shouldSkipBodyParsing(response: Response, request: ApiRequest): boolean {
    if (request.method?.toUpperCase() === 'HEAD') {
      return true;
    }

    if (response.status === 204 || response.status === 205 || response.status === 304) {
      return true;
    }

    return !response.body;
  }
}
