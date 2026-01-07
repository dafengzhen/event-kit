import type { ApiRequest, ApiResponse, FetchAdapterConfig, HttpAdapter } from './types/api.ts';

/**
 * FetchAdapter.
 *
 * @author dafengzhen
 */
export class FetchAdapter implements HttpAdapter {
  private config: FetchAdapterConfig;

  constructor(config: FetchAdapterConfig = {}) {
    this.config = {
      responseType: 'json',
      ...config,
    };
  }

  async send<T>(request: ApiRequest): Promise<ApiResponse<T>> {
    const { url } = request;

    const config = this.mergeConfigWithRequest(request);

    const requestInit = await this.buildRequestInitFromRequest(request, config);

    const response = await fetch(url, requestInit);

    return await this.handleResponse<T>(response, request, config);
  }

  private async buildRequestInitFromRequest(request: ApiRequest, config: FetchAdapterConfig): Promise<RequestInit> {
    const { body, data, headers, method, signal } = request;

    let requestBody: BodyInit | undefined;

    if (body !== undefined) {
      requestBody = body;
    } else if (data !== undefined) {
      requestBody = this.prepareRequestBody(data, headers!);
    }

    const requestInit: RequestInit = {
      headers,
      method,
    };

    if (requestBody !== undefined) {
      requestInit.body = requestBody;
    }

    if (signal) {
      requestInit.signal = signal;
    } else if (config.signal) {
      requestInit.signal = config.signal;
    }

    return {
      ...config,
      ...requestInit,
    };
  }

  private determineResponseType(contentType: string): 'arraybuffer' | 'blob' | 'formData' | 'json' | 'text' {
    if (contentType.includes('application/json')) {
      return 'json';
    } else if (contentType.includes('multipart/form-data')) {
      return 'formData';
    } else if (contentType.includes('image/') || contentType.includes('application/octet-stream')) {
      return 'blob';
    } else if (contentType.includes('text/')) {
      return 'text';
    }

    return 'text';
  }

  private async extractResponseData<T>(response: Response, responseType?: string): Promise<T> {
    if (response.status === 201 || response.status === 204) {
      return undefined as T;
    }

    if (!response.body) {
      return undefined as T;
    }

    const contentType = response.headers.get('content-type') || '';

    const actualResponseType = responseType || this.determineResponseType(contentType);

    switch (actualResponseType) {
      case 'arraybuffer':
        return response.arrayBuffer() as Promise<T>;
      case 'blob':
        return response.blob() as Promise<T>;
      case 'formData':
        return response.formData() as Promise<T>;
      case 'text':
        return response.text() as Promise<T>;
      case 'json':
      default:
        try {
          const text = await response.text();
          return text ? JSON.parse(text) : (undefined as T);
        } catch (_error) {
          const text = await response.text();
          return text as T;
        }
    }
  }

  private async handleResponse<T>(
    response: Response,
    request: ApiRequest,
    fetchConfig: FetchAdapterConfig,
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let data: T;

    if (fetchConfig.responseTransformer) {
      data = await fetchConfig.responseTransformer<T>(response, request);
    } else {
      const responseType = request.responseType ?? fetchConfig.responseType;
      data = await this.extractResponseData<T>(response, responseType);
    }

    return {
      data,
      headers,
      request,
      status: response.status,
      statusText: response.statusText,
    };
  }

  private mergeConfigWithRequest(request: ApiRequest): FetchAdapterConfig {
    const { config } = request;
    return {
      ...this.config,
      ...config,
    };
  }

  private prepareRequestBody(data: any, headers: Record<string, string>): BodyInit {
    const contentType = headers['Content-Type'] || headers['content-type'];

    if (contentType) {
      if (contentType.includes('application/json')) {
        return JSON.stringify(data);
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        if (data instanceof URLSearchParams) {
          return data.toString();
        } else if (typeof data === 'object') {
          const params = new URLSearchParams();
          Object.entries(data).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
              params.append(key, String(value));
            }
          });
          return params.toString();
        }
      } else if (contentType.includes('multipart/form-data') && data instanceof FormData) {
        return data;
      }
    }

    if (data instanceof FormData || data instanceof Blob || data instanceof ArrayBuffer) {
      return data;
    } else if (data instanceof URLSearchParams) {
      return data.toString();
    } else if (typeof data === 'object') {
      return JSON.stringify(data);
    } else {
      return String(data);
    }
  }
}
