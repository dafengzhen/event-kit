import type { QuerySerializer, QueryValue, SerializeOptions } from '../types/api.ts';

export function buildURL(baseURL: string = '', path: string = ''): string {
  if (!baseURL) {
    return path || '';
  }

  if (!path) {
    return baseURL;
  }

  try {
    return new URL(path, baseURL || undefined).toString();
  } catch {
    const normalizedBase = baseURL.replace(/\/+$/, '');
    const normalizedPath = path.replace(/^\/+/, '');
    return `${normalizedBase}/${normalizedPath}`;
  }
}

export function buildURLWithParams(
  baseURL: string,
  path: string,
  params?: Record<string, QueryValue>,
  serializer?: QuerySerializer,
): string {
  const url = buildURL(baseURL, path);
  if (!params) {
    return url;
  }

  const keys = Object.keys(params);
  if (keys.length === 0) {
    return url;
  }

  const queryString = serializer
    ? serializer.serialize(params)
    : defaultSerializeParams(params, { arrayFormat: 'brackets' });

  if (!queryString) {
    return url;
  }

  const separator = url.includes('?') ? '&' : '?';
  return url + separator + queryString;
}

function defaultSerializeParams(params: Record<string, QueryValue>, options: SerializeOptions = {}): string {
  const { arrayFormat = 'brackets', skipEmptyString = false } = options;
  const sp = new URLSearchParams();

  const isNil = (v: unknown): v is null | undefined => v === null || v === undefined;

  const append = (key: string, value: unknown) => {
    if (isNil(value)) {
      return;
    }

    if (skipEmptyString && value === '') {
      return;
    }

    sp.append(key, String(value));
  };

  const addValue = (key: string, value: QueryValue): void => {
    if (isNil(value)) {
      return;
    }

    if (skipEmptyString && value === '') {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNil(item)) {
          continue;
        }

        const k = arrayFormat === 'brackets' ? `${key}[]` : key;
        append(k, item);
      }
      return;
    }

    if (value instanceof Date) {
      append(key, value.toISOString());
      return;
    }

    if (typeof value === 'object') {
      for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
        if (isNil(subValue)) {
          continue;
        }

        if (skipEmptyString && subValue === '') {
          continue;
        }

        append(`${key}[${subKey}]`, subValue);
      }

      return;
    }

    append(key, value);
  };

  for (const [k, v] of Object.entries(params)) {
    addValue(k, v);
  }

  return sp.toString();
}
