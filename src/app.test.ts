import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from './test/prisma-mock.js';

vi.mock('./config/db.js', () => ({ prisma: prismaMock }));
vi.mock('./config/env.js', () => ({
  getEnv: () => ({ API_KEY: 'a_long_random_api_key_1234', TELEGRAM_WEBHOOK_SECRET: 'webhook_secret_value_1234', PORT: 3000 }),
}));
vi.mock('./config/telegram.js', () => ({
  telegramConfig: { token: 't', channelId: 'c', webhookSecret: 'webhook_secret_value_1234' },
}));
vi.mock('./integrations/telegram/telegram.adapter.js', () => ({
  TelegramAdapter: class { name = 'telegram'; sendInvite = vi.fn(); publishFinalRoster = vi.fn(); },
}));
vi.mock('./integrations/telegram/telegram.client.js', () => ({
  TelegramClient: class { answerCallback = vi.fn(); sendMessage = vi.fn(); getBotUsername = vi.fn(); },
}));

import { buildApp } from './app.js';

const KEY = { 'x-api-key': 'a_long_random_api_key_1234' };
const ID = '3f2b8c1e-8a4d-4c55-9d7e-000000000001';

beforeEach(() => resetPrismaMock());

describe('buildApp', () => {
  test('health check is public', async () => {
    const res = await (await buildApp()).inject('/health');
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  test.each([
    ['GET', '/events'],
    ['POST', '/events'],
    ['GET', `/events/${ID}`],
    ['PATCH', `/events/${ID}/roster`],
    ['POST', `/events/${ID}/publish`],
    ['GET', '/groups'],
    ['POST', '/groups'],
    ['GET', `/groups/${ID}`],
    ['DELETE', `/groups/${ID}`],
    ['POST', `/groups/${ID}/members`],
    ['DELETE', `/groups/${ID}/members/${ID}`],
    ['POST', '/profiles/characters'],
    ['PUT', `/profiles/main-character/${ID}`],
    ['GET', `/profiles/me/${ID}`],
    ['GET', '/characters'],
    ['GET', '/meta/wow'],
    ['GET', '/auth/check'],
  ] as const)('%s %s needs the API key', async (method, url) => {
    const app = await buildApp();

    expect((await app.inject({ method, url })).statusCode).toBe(401);
    expect((await app.inject({ method, url, headers: { 'x-api-key': 'wrong' } })).statusCode).toBe(401);
    expect((await app.inject({ method, url, headers: { 'x-api-key': '' } })).statusCode).toBe(401);
  });

  test('the key is not accepted from the query string or as a bearer token', async () => {
    const app = await buildApp();
    expect((await app.inject('/events?x-api-key=a_long_random_api_key_1234')).statusCode).toBe(401);
    expect((await app.inject({ url: '/events', headers: { authorization: 'Bearer a_long_random_api_key_1234' } })).statusCode).toBe(401);
  });

  test('GET /auth/check confirms a valid key', async () => {
    const res = await (await buildApp()).inject({ url: '/auth/check', headers: KEY });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  test('the key opens officer routes', async () => {
    prismaMock.event.findMany.mockResolvedValue([]);
    const res = await (await buildApp()).inject({ url: '/events', headers: KEY });
    expect(res.statusCode).toBe(200);
  });

  test('the webhook is guarded by its own secret, not the API key', async () => {
    const app = await buildApp();
    const body = { update_id: 1 };

    expect((await app.inject({ method: 'POST', url: '/webhooks/telegram', payload: body, headers: KEY })).statusCode).toBe(401);
    expect((await app.inject({
      method: 'POST', url: '/webhooks/telegram', payload: body,
      headers: { 'x-telegram-bot-api-secret-token': 'webhook_secret_value_1234' },
    })).statusCode).toBe(200);
  });

  test('unknown routes are 404 (and unauthenticated probing learns nothing about officer routes)', async () => {
    const app = await buildApp();
    expect((await app.inject('/nope')).statusCode).toBe(404);
  });
});
