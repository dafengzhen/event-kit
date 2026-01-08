import type { ApiRequest, ApiResponse, HttpAdapter, ResponseType, WxAdapterConfig } from './types/api.ts';

declare const wx: any;

/**
 * WxRequestAdapter.
 *
 * @author dafengzhen
 */
export class WxRequestAdapter implements HttpAdapter {
  private readonly config: WxAdapterConfig;

  constructor(config: WxAdapterConfig = {}) {
    this.config = {
      responseType: 'json',
      ...config,
    };
  }

  send<T>(request: ApiRequest): Promise<ApiResponse<T>> {
    return new Promise((resolve, reject) => {
      const { data, headers, method, responseType: requestResponseType, signal, timeout, url } = request;
      const desiredType = requestResponseType ?? this.config.responseType;
      const wxResponseType = this.mapWxResponseType(desiredType);
      const wxDataType = this.mapWxDataType(desiredType, wxResponseType);

      let settled = false;
      let abortHandler: (() => void) | undefined;

      const cleanup = () => {
        if (!signal || !abortHandler) {
          return;
        }

        try {
          signal.removeEventListener('abort', abortHandler);
        } catch {
          /* empty */
        }
      };

      const safeResolve = (value: ApiResponse<T>) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(value);
      };

      const safeReject = (err: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(err);
      };

      const bindAbort = (task: any) => {
        if (!signal) {
          return;
        }

        abortHandler = () => {
          try {
            task.abort();
          } catch {
            /* empty */
          }
        };

        if (signal.aborted) {
          abortHandler();
          return;
        }

        signal.addEventListener('abort', abortHandler, { once: true });
      };

      const passTimeoutToWx = !signal && typeof timeout === 'number';

      const task = wx.request({
        data,
        dataType: wxDataType,
        fail: (err: any) => {
          safeReject(err);
        },
        header: headers,
        method,
        responseType: wxResponseType,
        success: async (res: any) => {
          const responseData = await this.getResponseData<T>(res, request, desiredType, wxResponseType);

          safeResolve({
            data: responseData,
            headers: res.header,
            originalResponse: res,
            status: res.statusCode,
            statusText: String(res.statusCode),
          });
        },
        timeout: passTimeoutToWx ? timeout : undefined,
        url,
      });

      bindAbort(task);
    });
  }

  private extractResponseData<T>(res: any, desiredType: ResponseType | undefined, wxResponseType: any): T {
    const raw = res.data;

    if (wxResponseType === 'arraybuffer') {
      return raw as T;
    }

    if (desiredType === 'json') {
      if (typeof raw === 'string') {
        try {
          return JSON.parse(raw) as T;
        } catch {
          return raw as unknown as T;
        }
      }
      return raw as T;
    }

    return typeof raw === 'string' ? (raw as T) : (JSON.stringify(raw) as unknown as T);
  }

  private async getResponseData<T>(
    res: any,
    request: ApiRequest,
    desiredType: ResponseType | undefined,
    wxResponseType: any,
  ): Promise<T> {
    if (this.shouldSkipBodyParsing(res, request)) {
      return undefined as T;
    }

    if (this.config.responseTransformer) {
      return this.config.responseTransformer<T>(res, request);
    }

    return this.extractResponseData<T>(res, desiredType, wxResponseType);
  }

  private mapWxDataType(desiredType: ResponseType | undefined, wxResponseType: any): any {
    if (wxResponseType === 'arraybuffer') {
      return 'text';
    }

    return desiredType === 'json' ? 'json' : 'text';
  }

  private mapWxResponseType(desiredType?: ResponseType): any {
    return desiredType === 'arraybuffer' || desiredType === 'blob' ? 'arraybuffer' : 'text';
  }

  private shouldSkipBodyParsing(res: any, request: ApiRequest): boolean {
    if (request.method?.toUpperCase() === 'HEAD') {
      return true;
    }

    if (res.statusCode === 204 || res.statusCode === 205 || res.statusCode === 304) {
      return true;
    }

    return res.data === null || res.data === undefined;
  }
}
