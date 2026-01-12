import type { VersionContext, VersionRule } from './types.ts';

import { InvalidVersionError } from './version-error.ts';

export const compareVersion = (a: string, b: string): number => {
  if (!a || !b) {
    throw new InvalidVersionError('empty');
  }

  const normalize = (v: string): number[] => {
    const [main] = v.split('-');
    const parts = main.split('.').map((n) => {
      const num = Number(n);
      if (!Number.isInteger(num) || num < 0) {
        throw new InvalidVersionError(n);
      }
      return num;
    });
    while (parts.length < 3) {
      parts.push(0);
    }
    return parts;
  };

  const pa = normalize(a);
  const pb = normalize(b);

  for (let i = 0; i < 3; i++) {
    const diff = pa[i] - pb[i];
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
};

export const isPromise = <T>(v: any): v is Promise<T> => v && typeof v.then === 'function';

export const defaultCacheKey = (ctx: VersionContext): string =>
  JSON.stringify(
    Object.keys(ctx)
      .sort()
      .reduce((o, k) => {
        o[k] = ctx[k];
        return o;
      }, {} as any),
  );

export const getPriority = (r: VersionRule<any>) => r.priority ?? 0;
