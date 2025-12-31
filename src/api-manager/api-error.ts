import type { ApiErrorCode, ApiRequest, ApiResponse } from './types.ts';

/**
 * ApiError.
 *
 * @author dafengzhen
 */
export class ApiError extends Error {
  public cause?: unknown;

  public code: ApiErrorCode;

  public details?: Record<string, unknown>;

  public request?: ApiRequest;

  public response?: ApiResponse;

  public status?: number;

  constructor(message: {
    [key: string]: unknown;
    cause?: unknown;
    code: ApiErrorCode;
    details?: Record<string, unknown>;
    message?: string;
    request?: ApiRequest;
    response?: ApiResponse;
    status?: number;
  }) {
    const errorMessage = message.message ? `${message.code}: ${message.message}` : message.code;

    super(errorMessage);

    this.code = message.code;
    this.request = message.request;
    this.response = message.response;
    this.status = message.status;
    this.cause = message.cause;

    const {
      cause: _cause,
      code: _code,
      details,
      message: _message,
      request: _request,
      response: _response,
      status: _status,
      ...extras
    } = message;
    this.details = details || {};

    if (Object.keys(extras).length > 0) {
      this.details = { ...this.details, ...extras };
    }

    Error.captureStackTrace?.(this, ApiError);
  }

  static create(
    code: ApiErrorCode,
    options?: {
      [key: string]: unknown;
      cause?: unknown;
      details?: Record<string, unknown>;
      message?: string;
      request?: ApiRequest;
      response?: ApiResponse;
      status?: number;
    },
  ): ApiError {
    return new ApiError({
      code,
      ...options,
    });
  }

  toJSON(): Record<string, unknown> {
    const json: Record<string, unknown> = {
      code: this.code,
      message: this.message,
      name: this.name,
      stack: this.stack,
    };

    if (this.status !== undefined) {
      json.status = this.status;
    }

    if (this.details && Object.keys(this.details).length > 0) {
      json.details = this.details;
    }

    if (this.cause !== undefined) {
      json.cause = this.cause;
    }

    if (this.request !== undefined) {
      json.request = {
        method: this.request.method,
        url: this.request.url,
      };
    }

    if (this.response !== undefined) {
      json.response = {
        status: this.response.status,
        statusText: this.response.statusText,
      };
    }

    return json;
  }

  toString(): string {
    let str = `${this.name}: ${this.code}`;

    if (this.status !== undefined) {
      str += ` (Status: ${this.status})`;
    }

    if (this.message && this.message !== this.code) {
      str += ` - ${this.message}`;
    }

    return str;
  }
}

export const ApiErrors = {
  badRequest: (details?: Record<string, unknown>) => ApiError.create('BAD_REQUEST', { details, status: 400 }),

  forbidden: (details?: Record<string, unknown>) => ApiError.create('FORBIDDEN', { details, status: 403 }),

  internalServerError: (details?: Record<string, unknown>) =>
    ApiError.create('INTERNAL_SERVER_ERROR', { details, status: 500 }),

  networkError: (cause?: unknown, request?: ApiRequest) => ApiError.create('NETWORK_ERROR', { cause, request }),

  notFound: (details?: Record<string, unknown>) => ApiError.create('NOT_FOUND', { details, status: 404 }),

  timeout: (request?: ApiRequest) => ApiError.create('TIMEOUT', { request }),

  unauthorized: (details?: Record<string, unknown>) => ApiError.create('UNAUTHORIZED', { details, status: 401 }),

  validationError: (details?: Record<string, unknown>) => ApiError.create('VALIDATION_ERROR', { details, status: 422 }),
};
