import type { APIConfig, ApiRequest, ApiResponse, HttpAdapter } from './types/api.ts';

export function createFetchAdapter(_config: APIConfig): HttpAdapter {
  return {
    async send<T>(request: ApiRequest<T>): Promise<ApiResponse<T>> {
      const { body, data, headers, method, signal, url } = request;

      const res = await fetch(url, {
        body: body ?? (data == null ? undefined : JSON.stringify(data)),
        headers,
        method,
        signal,
      });

      const contentType = res.headers.get('content-type') || '';
      const payload = contentType.includes('application/json') ? await res.json() : await res.text();

      return {
        data: payload as T,
        headers: Object.fromEntries(res.headers.entries()),
        status: res.status,
        statusText: res.statusText,
      };
    },
  };
}
