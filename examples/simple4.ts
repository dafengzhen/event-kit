import { createFetchAdapter } from '../src/api-manager/fetch-adapter.ts';
import { APIManager } from '../src/index.ts';

const api = APIManager.create({
  adapter: (config) => createFetchAdapter(config),
  baseURL: 'https://jsonplaceholder.typicode.com',
});

api.useInterceptor({
  onRequest: async (req) => {
    return {
      ...req,
      headers: {
        ...req.headers,
        Authorization: `Bearer demo-token`,
      },
      meta: { ...(req.meta || {}), startedAt: Date.now() },
    };
  },
  weight: 100,
});

api.useInterceptor({
  onResponse: async (res) => {
    const startedAt = res.request!.meta!.startedAt as number;
    const cost = startedAt ? Date.now() - startedAt : undefined;
    console.log(`[API] ${res.request!.method} ${res.request!.url} -> ${res.status} cost=${cost ?? res.duration}ms`);
    return res;
  },
  weight: 10,
});

async function run() {
  const r = await api.get('/posts/1');
  console.log(r.data);
}

run().catch(console.error);
