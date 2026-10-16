import Fastify from 'fastify';
import { describe, expect, test, vi } from 'vitest';

vi.mock('../config/env.js', () => ({ getEnv: () => ({ API_KEY: 'a_long_random_api_key_1234' }) }));

import { requireApiKey } from './auth.js';

async function app() {
  const fastify = Fastify();
  await fastify.register(async (scope) => {
    requireApiKey(scope);
    scope.get('/secure', async () => ({ ok: true }));
  });
  fastify.get('/open', async () => ({ ok: true }));
  return fastify;
}

describe('requireApiKey', () => {
  test('rejects requests without a key', async () => {
    expect((await (await app()).inject('/secure')).statusCode).toBe(401);
  });

  test('rejects a wrong key', async () => {
    const res = await (await app()).inject({ url: '/secure', headers: { 'x-api-key': 'nope' } });
    expect(res.statusCode).toBe(401);
  });

  test('allows the right key', async () => {
    const res = await (await app()).inject({ url: '/secure', headers: { 'x-api-key': 'a_long_random_api_key_1234' } });
    expect(res.statusCode).toBe(200);
  });

  test('does not protect routes outside its scope', async () => {
    expect((await (await app()).inject('/open')).statusCode).toBe(200);
  });
});
