import { createFetchAdapter } from '../src/api-manager/fetch-adapter.ts';
import { APIManager } from '../src/index.ts';

const api = APIManager.create({
  adapter: (config) => createFetchAdapter(config),
  baseURL: 'https://jsonplaceholder.typicode.com',
});

api.on('api:start', ({ payload }) => {
  console.log('[start]', payload.request.meta?.requestId, payload.request.method, payload.request.url);
});

api.on('api:success', ({ payload }) => {
  console.log('[success]', payload.request.meta?.requestId, payload.response.status, payload.duration, 'ms');
});

api.on('api:error', ({ payload }) => {
  console.log('[error]', payload.request.meta?.requestId, payload.error);
});

api.on('api:end', ({ payload }) => {
  console.log('[end]', payload.request.meta?.requestId, payload.duration, 'ms');
});

async function run() {
  await api.get('/photos', { timeout: 1 });
}

run().catch((e) => console.log('caught', e));
