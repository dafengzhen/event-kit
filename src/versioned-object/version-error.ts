/**
 * VersionError.
 *
 * @author dafengzhen
 */
export class VersionError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'VersionError';
  }
}

/**
 * AsyncPredicateError.
 *
 * @author dafengzhen
 */
export class AsyncPredicateError extends VersionError {
  constructor() {
    super('Async predicate detected. Use resolveAsync().', 'ASYNC_PREDICATE');
  }
}

/**
 * AsyncRuleValueError.
 *
 * @author dafengzhen
 */
export class AsyncRuleValueError extends VersionError {
  constructor() {
    super('Async rule value detected. Use resolveAsync().', 'ASYNC_RULE_VALUE');
  }
}

/**
 * InvalidContextError.
 *
 * @author dafengzhen
 */
export class InvalidContextError extends VersionError {
  constructor(message: string) {
    super(message, 'INVALID_CONTEXT');
  }
}

/**
 * InvalidRuleError.
 *
 * @author dafengzhen
 */
export class InvalidRuleError extends VersionError {
  constructor(message: string) {
    super(message, 'INVALID_RULE');
  }
}

/**
 * InvalidVersionError.
 *
 * @author dafengzhen
 */
export class InvalidVersionError extends VersionError {
  constructor(component: string) {
    super(`Invalid version component: ${component}`, 'INVALID_VERSION');
  }
}
