/**
 * @jest-environment node
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { APIManager } from './api-manager.ts';
import { FetchAdapter } from './fetch-adapter.ts';

type Off = () => void;

const createJsonPlaceholderClient = () =>
  APIManager.create({
    adapter: () => new FetchAdapter({ responseType: 'json' }),
    baseURL: 'https://jsonplaceholder.typicode.com',
    defaultHeaders: {
      'content-type': 'application/json',
    },
  });

const createHttpbinClient = () =>
  APIManager.create({
    adapter: () => new FetchAdapter({ responseType: 'json' }),
    baseURL: 'https://httpbin.org',
  });

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const collectEvents = (
  api: ReturnType<typeof APIManager.create>,
  names: Array<'api:end' | 'api:error' | 'api:start' | 'api:success' | 'api:timeout' | string>,
) => {
  const events: string[] = [];
  const offs: Off[] = [];

  for (const name of names) {
    const off = api.on(name, () => events.push(name.replace('api:', '')));
    offs.push(off);
  }

  return {
    events,
    off: () => offs.forEach((fn) => fn()),
  };
};

/**
 * APIManager + FetchAdapter.
 *
 * @author dafengzhen
 */
describe('APIManager + FetchAdapter (real public APIs)', () => {
  const cleanup: Off[] = [];

  beforeEach(() => {
    jest.setTimeout(30_000);
  });

  afterEach(() => {
    while (cleanup.length) {
      cleanup.pop()?.();
    }
  });

  test('GET success: emits start/success/end and returns data', async () => {
    const api = createJsonPlaceholderClient();
    const tracker = collectEvents(api, ['api:start', 'api:success', 'api:end', 'api:error']);
    cleanup.push(tracker.off);

    const res = await api.get('/todos/1');

    expect(res.status).toBe(200);
    expect(res.data).toBeDefined();
    expect(res.data.id).toBe(1);

    expect(tracker.events).toEqual(['start', 'success', 'end']);
  });

  test('Non-2xx response: emits api:error but request() returns processedResponse (does NOT throw)', async () => {
    const api = createJsonPlaceholderClient();
    const tracker = collectEvents(api, ['api:error', 'api:end']);
    cleanup.push(tracker.off);

    const res = await api.get('/this-endpoint-should-404');

    expect(res.status).toBe(404);
    expect(tracker.events).toEqual(['error', 'end']);

    expect(res.error).toBeUndefined();
  });

  test('validateStatus override: treat 404 as success (no api:error)', async () => {
    const api = createJsonPlaceholderClient();
    const tracker = collectEvents(api, ['api:error', 'api:success']);
    cleanup.push(tracker.off);

    const res = await api.get('/this-endpoint-should-404', {
      validateStatus: (status) => status === 404,
    });

    expect(res.status).toBe(404);
    expect(tracker.events).toEqual(['success']);
  });

  test('Timeout abort: emits api:timeout, then throws ApiError', async () => {
    const api = createHttpbinClient();
    const tracker = collectEvents(api, ['api:timeout', 'api:error', 'api:end']);
    cleanup.push(tracker.off);

    await expect(
      api.get('/delay/3', {
        timeout: 500,
      }),
    ).rejects.toMatchObject({
      code: 'ERROR',
      name: 'ApiError',
    });

    expect(tracker.events[0]).toBe('timeout');
    expect(tracker.events).toContain('error');
    expect(tracker.events).toContain('end');
  });

  test('CancellationToken: cancel before request => throws ApiError', async () => {
    const api = createJsonPlaceholderClient();

    const token = api.createCancellationToken();
    token.cancel('user cancelled');

    await expect(
      api.get('/todos/1', {
        cancellationToken: token,
      }),
    ).rejects.toMatchObject({
      code: 'ERROR',
      name: 'ApiError',
    });
  });

  test('Abort by cancelRequest(requestId): cancels inflight fetch', async () => {
    const api = createHttpbinClient();

    let capturedRequestId: string | undefined;
    const offStart = api.on('api:start', ({ request }) => {
      capturedRequestId = request.meta?.requestId as string | undefined;
    });
    cleanup.push(offStart);

    const p = api.get('/delay/3', { timeout: 10_000 });

    await sleep(50);

    expect(capturedRequestId).toBeTruthy();
    const cancelled = api.cancelRequest(capturedRequestId!, 'manual abort');
    expect(cancelled).toBe(true);

    await expect(p).rejects.toMatchObject({
      code: 'ERROR',
      name: 'ApiError',
    });
  });
});
