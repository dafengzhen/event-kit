import type { ApiErrorCode, ApiErrorContext } from './types/api.ts';

/**
 * ApiError.
 *
 * @author dafengzhen
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;

  readonly context?: ApiErrorContext;

  constructor(code: ApiErrorCode, message: string, options?: { cause?: unknown; context?: ApiErrorContext }) {
    super(message, { cause: options?.cause });

    this.name = 'ApiError';
    this.code = code;
    this.context = options?.context;
  }

  toJSON() {
    return {
      cause:
        this.cause instanceof Error
          ? { message: this.cause.message, name: this.cause.name, stack: this.cause.stack }
          : this.cause,
      code: this.code,
      context: this.context,
      message: this.message,
      name: this.name,
      stack: this.stack,
    };
  }
}
