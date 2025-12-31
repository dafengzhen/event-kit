import type { ApiCacheEntry, ApiRequest, ApiResponse, CacheStrategy } from './types.ts';

import { HttpMethod } from './types.ts';

/**
 * DefaultCacheStrategy.
 *
 * @author dafengzhen
 */
export class DefaultCacheStrategy implements CacheStrategy {
  private readonly defaultTTLms: number;

  private readonly defaultVaryKeys: string[];

  constructor(defaultTTLms: number, options?: { defaultVaryKeys?: string[] }) {
    this.defaultTTLms = defaultTTLms;
    this.defaultVaryKeys = (options?.defaultVaryKeys ?? ['accept', 'authorization']).map((s) => s.toLowerCase());
  }

  generateKey(request: ApiRequest): string {
    const method = request.method;
    const url = this.canonicalizeUrl(request.url);
    const params = this.normalizeObject(request.params);
    const reqHeaders = this.lowercaseHeaders(request.headers);

    const vary = this.pickHeaders(reqHeaders, this.defaultVaryKeys);

    const parts = {
      method,
      params,
      url,
      vary,
    };

    return JSON.stringify(parts);
  }

  getTTL(request: ApiRequest, response: ApiResponse): number {
    const resHeaders = this.lowercaseHeaders(response.headers);
    const reqHeaders = this.lowercaseHeaders(request.headers);

    const reqCC = this.parseCacheControl(reqHeaders['cache-control']);
    const resCC = this.parseCacheControl(resHeaders['cache-control']);
    if (reqCC.noStore || resCC.noStore) {
      return 0;
    }

    const maxAge = resCC.maxAge ?? undefined;
    if (typeof maxAge === 'number') {
      return maxAge * 1000;
    }

    const expiresAt = this.parseHttpDate(resHeaders['expires']);
    const dateAt = this.parseHttpDate(resHeaders['date']);
    if (expiresAt !== undefined) {
      const base = dateAt ?? Date.now();
      const delta = expiresAt - base;
      return Math.max(0, delta);
    }

    return this.defaultTTLms;
  }

  pickVaryHeadersWithResponse(request: ApiRequest, response: ApiResponse): Record<string, string> {
    const reqHeaders = this.lowercaseHeaders(request.headers);
    const resHeaders = this.lowercaseHeaders(response.headers);

    const varyHeader = resHeaders['vary'];
    const varyKeys = this.parseVary(varyHeader) ?? this.defaultVaryKeys;
    return this.pickHeaders(reqHeaders, varyKeys);
  }

  shouldCache(request: ApiRequest, response: ApiResponse): boolean {
    if (request.method !== HttpMethod.GET) {
      return false;
    }
    if (response.status < 200 || response.status >= 300) {
      return false;
    }

    const reqHeaders = this.lowercaseHeaders(request.headers);
    const resHeaders = this.lowercaseHeaders(response.headers);

    const reqCC = this.parseCacheControl(reqHeaders['cache-control']);
    const resCC = this.parseCacheControl(resHeaders['cache-control']);

    if (reqCC.noStore || reqCC.noCache) {
      return false;
    }

    if (resCC.noStore) {
      return false;
    }

    const hasAuth = !!reqHeaders['authorization'];
    const explicitlyCacheable = typeof resCC.maxAge === 'number' || typeof resCC.sMaxage === 'number' || resCC.public;

    if (hasAuth && !explicitlyCacheable) {
      return false;
    }

    return resCC.maxAge !== 0;
  }

  shouldInvalidate(_key: string, entry: ApiCacheEntry): boolean {
    const swr = entry.staleWhileRevalidate ?? 0;
    const hardExpiry = entry.expires + swr;
    return Date.now() >= hardExpiry;
  }

  shouldRevalidate(_key: string, entry: ApiCacheEntry, _request: ApiRequest): boolean {
    const swr = entry.staleWhileRevalidate;
    if (!swr) {
      return false;
    }

    const now = Date.now();
    return now >= entry.expires && now < entry.expires + swr;
  }

  private canonicalizeUrl(input: string): string {
    try {
      const u = new URL(input, 'http://cache.local');
      const entries = Array.from(u.searchParams.entries());
      entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      u.search = '';
      for (const [k, v] of entries) {
        u.searchParams.append(k, v);
      }

      const path = u.pathname;
      const query = u.search;
      const hash = u.hash;
      return `${path}${query}${hash}`;
    } catch {
      return input;
    }
  }

  private lowercaseHeaders(headers: Record<string, string> | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!headers) {
      return out;
    }
    for (const [k, v] of Object.entries(headers)) {
      out[k.toLowerCase()] = v;
    }
    return out;
  }

  private normalizeObject(obj?: Record<string, any>): Record<string, any> {
    if (!obj) {
      return {};
    }
    const out: Record<string, any> = {};
    for (const key of Object.keys(obj).sort()) {
      const val = obj[key];
      if (val === undefined) {
        continue;
      }

      if (Array.isArray(val)) {
        out[key] = val.map((x) => (x && typeof x === 'object' && !Array.isArray(x) ? this.normalizeObject(x) : x));
      } else if (val && typeof val === 'object') {
        out[key] = this.normalizeObject(val);
      } else {
        out[key] = val;
      }
    }
    return out;
  }

  private parseCacheControl(ccRaw: string | undefined): {
    maxAge?: number;
    noCache?: boolean;
    noStore?: boolean;
    private?: boolean;
    public?: boolean;
    sMaxage?: number;
    staleWhileRevalidate?: number;
  } {
    if (!ccRaw) {
      return {};
    }

    const parts = ccRaw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const out: any = {};
    for (const p of parts) {
      if (p === 'no-store') {
        out.noStore = true;
      } else if (p === 'no-cache') {
        out.noCache = true;
      } else if (p === 'public') {
        out.public = true;
      } else if (p === 'private') {
        out.private = true;
      } else if (p.startsWith('max-age')) {
        out.maxAge = this.parseSecondsKV(p);
      } else if (p.startsWith('s-maxage')) {
        out.sMaxage = this.parseSecondsKV(p);
      } else if (p.startsWith('stale-while-revalidate')) {
        out.staleWhileRevalidate = this.parseSecondsKV(p);
      }
    }
    return out;
  }

  private parseHttpDate(value: string | undefined): number | undefined {
    if (!value) {
      return undefined;
    }
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : undefined;
  }

  private parseSecondsKV(part: string): number | undefined {
    const m = part.match(/=\s*(\d+)/);
    if (!m) {
      return undefined;
    }
    return parseInt(m[1], 10);
  }

  private parseVary(varyHeader: string | undefined): string[] | undefined {
    if (!varyHeader) {
      return undefined;
    }
    const v = varyHeader.trim();
    if (!v) {
      return undefined;
    }
    if (v === '*') {
      return undefined;
    }
    return v
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  private pickHeaders(headers: Record<string, string>, keys: string[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const k of keys) {
      const key = k.toLowerCase();
      if (headers[key] !== undefined) {
        out[key] = headers[key];
      }
    }
    return out;
  }
}
