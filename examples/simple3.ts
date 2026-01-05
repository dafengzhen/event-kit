import { createFetchAdapter } from '../src/api-manager/fetch-adapter.ts';
import { APIManager } from '../src/index.ts';

const api = APIManager.create({
  adapter: (config) => createFetchAdapter(config),
  baseURL: 'https://jsonplaceholder.typicode.com',
  defaultHeaders: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

async function run() {
  // GET
  const r1 = await api.get('/posts/1');
  console.log('GET /posts/1 status=', r1.status);
  console.log('data=', r1.data);

  const r2 = await api.get('/comments', { params: { postId: 1 } });
  console.log('GET /comments?postId=1 count=', Array.isArray(r2.data) ? r2.data.length : r2.data);

  // POST
  const r3 = await api.post('/posts', {
    body: 'world',
    title: 'hello',
    userId: 1,
  });
  console.log('POST /posts status=', r3.status);
  console.log('data=', r3.data);
}

run().catch(console.error);
