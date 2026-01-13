import type { VersionContext, VersionRule } from './types.ts';

import { DEFAULT_CACHE_KEY } from './constants.ts';
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

const stable = (v: any): any => {
  if (Array.isArray(v)) {
    return v.map(stable);
  }

  if (v && typeof v === 'object') {
    return Object.keys(v)
      .sort()
      .reduce<Record<string, any>>((o, k) => {
        const val = v[k];
        if (val !== null && val !== undefined) {
          o[k] = stable(val);
        }
        return o;
      }, {});
  }

  return v;
};

export const defaultCacheKey = (ctx?: VersionContext): string => {
  if (!ctx) {
    return DEFAULT_CACHE_KEY;
  }
  return JSON.stringify(stable(ctx));
};

export const getPriority = (r: VersionRule<any>) => r.priority ?? 0;
