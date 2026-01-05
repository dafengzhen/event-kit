import { createFetchAdapter } from '../src/api-manager/fetch-adapter.ts';
import { APIManager } from '../src/index.ts';

const api = APIManager.create({
  adapter: (config) => createFetchAdapter(config),
  baseURL: 'https://jsonplaceholder.typicode.com',
});

async function run() {
  const req1 = api.get('/photos');
  const req2 = api.get('/comments');

  setTimeout(() => {
    console.log('active before cancel=', api.getActiveRequestCount(), api.getActiveRequestIds());
    api.cancelAllRequests('Route changed');
    console.log('active after cancel=', api.getActiveRequestCount());
  }, 30);

  try {
    await Promise.all([req1, req2]);
  } catch (e) {
    console.log('some request cancelled/failed:', e);
  }
}

run().catch(console.error);
