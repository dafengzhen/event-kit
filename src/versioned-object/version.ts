import type { VersionContext, VersionPredicate } from './types.ts';

import { compareVersion } from './helpers.ts';

/**
 * Version.
 *
 * @author dafengzhen
 */
export const Version = {
  and:
    (...predicates: VersionPredicate[]): VersionPredicate =>
    async (ctx) => {
      for (const p of predicates) {
        if (!(await p(ctx))) {
          return false;
        }
      }
      return true;
    },
  between:
    (min: string, max: string): VersionPredicate =>
    (ctx) =>
      compareVersion(ctx.version, min) >= 0 && compareVersion(ctx.version, max) <= 0,
  custom: (predicate: VersionPredicate): VersionPredicate => predicate,
  env:
    (env: VersionContext['env']): VersionPredicate =>
    (ctx) =>
      ctx.env === env,
  eq:
    (v: string): VersionPredicate =>
    (ctx) =>
      compareVersion(ctx.version, v) === 0,
  gt:
    (v: string): VersionPredicate =>
    (ctx) =>
      compareVersion(ctx.version, v) > 0,
  gte:
    (v: string): VersionPredicate =>
    (ctx) =>
      compareVersion(ctx.version, v) >= 0,
  lt:
    (v: string): VersionPredicate =>
    (ctx) =>
      compareVersion(ctx.version, v) < 0,
  lte:
    (v: string): VersionPredicate =>
    (ctx) =>
      compareVersion(ctx.version, v) <= 0,
  not:
    (predicate: VersionPredicate): VersionPredicate =>
    async (ctx) =>
      !(await predicate(ctx)),
  or:
    (...predicates: VersionPredicate[]): VersionPredicate =>
    async (ctx) => {
      for (const p of predicates) {
        if (await p(ctx)) {
          return true;
        }
      }
      return false;
    },
  platform:
    (platform: VersionContext['platform']): VersionPredicate =>
    (ctx) =>
      ctx.platform === platform,
};
