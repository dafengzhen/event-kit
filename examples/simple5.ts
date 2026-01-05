import { createFetchAdapter } from '../src/api-manager/fetch-adapter.ts';
import { APIManager } from '../src/index.ts';

const api = APIManager.create({
  adapter: (config) => createFetchAdapter(config),
  baseURL: 'https://jsonplaceholder.typicode.com',
});

async function run() {
  const token = api.createCancellationToken();

  const controller = new AbortController();

  token.register((reason) => controller.abort(reason));

  const p = api.get('/photos', {
    cancellationToken: token,
    signal: controller.signal,
  });

  setTimeout(() => {
    token.cancel('User clicked cancel');
  }, 50);

  try {
    const res = await p;
    console.log('should not reach, status=', res.status);
  } catch (e) {
    console.log('cancelled, error=', e);
  }
}

run().catch(console.error);
