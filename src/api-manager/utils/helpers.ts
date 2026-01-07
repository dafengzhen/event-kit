import type { QuerySerializer, QueryValue, SerializeOptions } from '../types/api.ts';

export const buildURL = (baseURL: string = '', path: string = ''): string => {
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
};

export const buildURLWithParams = (
  baseURL: string,
  path: string,
  params?: Record<string, QueryValue>,
  serializer?: QuerySerializer,
): string => {
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
};

export const defaultSerializeParams = (params: Record<string, QueryValue>, options: SerializeOptions = {}): string => {
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
};

export const prepareRequestBody = (data: any, headers: Record<string, string>): BodyInit => {
  const contentType = getHeader(headers, 'content-type');

  if (contentType) {
    const ct = contentType.toLowerCase();

    if (ct.includes('application/json') || ct.includes('+json')) {
      return JSON.stringify(data);
    }

    if (ct.includes('application/x-www-form-urlencoded')) {
      if (data instanceof URLSearchParams) {
        return data.toString();
      }

      if (typeof data === 'object' && data != null) {
        const params = new URLSearchParams();
        Object.entries(data).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            params.append(key, String(value));
          }
        });
        return params.toString();
      }
    }

    if (ct.includes('multipart/form-data') && data instanceof FormData) {
      return data;
    }
  }

  if (data instanceof FormData) {
    const existing = getHeader(headers, 'content-type');
    if (existing?.toLowerCase().includes('multipart/form-data')) {
      for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === 'content-type') {
          delete headers[k];
        }
      }
    }
    return data;
  }

  if (data instanceof Blob) {
    return data;
  }

  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    return data as BodyInit;
  }

  if (data instanceof URLSearchParams) {
    return data.toString();
  }

  if (typeof data === 'object' && data != null) {
    if (!getHeader(headers, 'content-type')) {
      setHeader(headers, 'Content-Type', 'application/json');
    }

    return JSON.stringify(data);
  }

  if (!getHeader(headers, 'content-type')) {
    setHeader(headers, 'Content-Type', 'text/plain');
  }

  return String(data);
};

export const getHeader = (headers: Record<string, string>, name: string): string | undefined => {
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) {
      return headers[k];
    }
  }
  return undefined;
};

export const setHeader = (headers: Record<string, string>, name: string, value: string): void => {
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) {
      headers[k] = value;
      return;
    }
  }
  headers[name] = value;
};

export const removeHeader = (headers: Record<string, string>, name: string): void => {
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) {
      delete headers[k];
    }
  }
};
