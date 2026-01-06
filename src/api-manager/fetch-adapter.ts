import type { ApiRequest, ApiResponse, HttpAdapter } from './types/api.ts';

/**
 * FetchAdapter.
 *
 * @author dafengzhen
 */
export class FetchAdapter implements HttpAdapter {
  async send<T>(request: ApiRequest): Promise<ApiResponse<T>> {
    const { body, config, data, headers, method, signal, url } = request;

    const { extConfig } = config || {};
    const { fetch: fetchConfig } = extConfig || {};
    const { responseType, ...initConfig } = fetchConfig as Record<string, any> & RequestInit;

    const res = await fetch(url, {
      body: body ?? (data == null ? undefined : JSON.stringify(data)),
      headers,
      method,
      signal,
      ...initConfig,
    });

    const contentType = res.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await res.json() : await res.text();

    return {
      data: payload as T,
      headers: Object.fromEntries(res.headers.entries()),
      status: res.status,
      statusText: res.statusText,
    };
  }
}
