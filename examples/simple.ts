import type { Types } from '../src/index.ts';

import { TypedEventBus } from '../src/index.ts';

type MyEvents = Types.EventMapBase & {
  orderPlaced: { amount: number; id: string };
  userCreated: { id: string; name: string };
};

const bus = new TypedEventBus<MyEvents>();

bus.use(async (ctx, next) => {
  console.log(`[event] ${ctx.event} start`, ctx.payload);
  const start = Date.now();

  try {
    await next();
    console.log(`[event] ${ctx.event} done in ${Date.now() - start}ms`);
  } catch (err) {
    console.error(`[event] ${ctx.event} error`, err);
    throw err;
  }
});

const disposeTrim = bus.use(async (ctx, next) => {
  if (ctx.event === 'userCreated' && ctx.payload) {
    ctx.payload = {
      ...ctx.payload,
      name: (ctx.payload as any).name.trim(),
    };
  }
  await next();
});

disposeTrim();

bus.on('userCreated', async (payload) => {
  console.log('save user to db:', payload);
});

bus.on('userCreated', async (payload) => {
  console.log('send welcome email:', payload.id);
});

bus.emit('userCreated', {
  id: 'u_1',
  name: '  Alice  ',
});
