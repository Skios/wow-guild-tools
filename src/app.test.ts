import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from './test/prisma-mock.js';
import { SUPABASE_URL, makeSigner } from './test/jwt.js';

vi.mock('./config/db.js', () => ({ prisma: prismaMock }));
vi.mock('./config/env.js', () => ({
  getEnv: () => ({ SUPABASE_URL: 'http://127.0.0.1:54321', TELEGRAM_WEBHOOK_SECRET: 'webhook_secret_value_1234', PORT: 3000 }),
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

import { buildApp as realBuildApp } from './app.js';
import { supabaseTokenVerifier } from './plugins/auth.js';

const ID = '3f2b8c1e-8a4d-4c55-9d7e-000000000001';
let signer: Awaited<ReturnType<typeof makeSigner>>;
let KEY: { authorization: string };
const buildApp = () => realBuildApp({ verifyToken: supabaseTokenVerifier(SUPABASE_URL, signer.jwks) });

beforeAll(async () => {
  signer = await makeSigner();
  KEY = { authorization: `Bearer ${await signer.sign()}` };
});

beforeEach(() => {
  resetPrismaMock();
  prismaMock.identity.findUnique.mockResolvedValue({ user: { id: 'u1', username: 'Brannock', isOfficer: true } });
});

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
    ['GET', '/roster'],
    ['POST', '/roster'],
    ['PUT', `/roster/${ID}`],
    ['DELETE', `/roster/${ID}`],
    ['POST', `/roster/${ID}/release`],
    ['POST', `/events/${ID}/message`],
    ['GET', '/meta/wow'],
    ['GET', '/auth/me'],
  ] as const)('%s %s needs an officer login', async (method, url) => {
    const app = await buildApp();

    expect((await app.inject({ method, url })).statusCode).toBe(401);
    expect((await app.inject({ method, url, headers: { authorization: 'Bearer nope.nope.nope' } })).statusCode).toBe(401);
    expect((await app.inject({ method, url, headers: { 'x-api-key': 'a_long_random_api_key_1234' } })).statusCode).toBe(401);

    prismaMock.identity.findUnique.mockResolvedValue({ user: { id: 'u2', username: 'Rando', isOfficer: false } });
    expect((await app.inject({ method, url, headers: KEY })).statusCode).toBe(403);
  });

  test('the token is not accepted from the query string', async () => {
    const token = KEY.authorization.slice('Bearer '.length);
    expect((await (await buildApp()).inject(`/events?access_token=${token}`)).statusCode).toBe(401);
  });

  test('GET /auth/me says which officer is signed in', async () => {
    const res = await (await buildApp()).inject({ url: '/auth/me', headers: KEY });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: 'u1', username: 'Brannock' });
  });

  test('an officer login opens officer routes', async () => {
    prismaMock.event.findMany.mockResolvedValue([]);
    const res = await (await buildApp()).inject({ url: '/events', headers: KEY });
    expect(res.statusCode).toBe(200);
  });

  test('the webhook is guarded by its own secret, not the officer login', async () => {
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

describe('buildApp hardening', () => {
  const webhook = (headers: Record<string, string>, payload: string) =>
    ({ method: 'POST' as const, url: '/webhooks/telegram', headers: { 'content-type': 'application/json', ...headers }, payload });

  test('rejects a webhook call without the secret before reading the body', async () => {
    const res = await (await buildApp()).inject(webhook({}, '{not json'));
    expect(res.statusCode).toBe(401);
  });

  test('malformed JSON is a 400 with a safe message', async () => {
    const res = await (await buildApp()).inject({
      method: 'POST', url: '/roster', headers: { ...KEY, 'content-type': 'application/json' }, payload: '{not json',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: expect.any(String) });
  });

  test('bodies over the limit are refused with 413', async () => {
    const res = await (await buildApp()).inject({
      method: 'POST', url: '/roster', headers: { ...KEY, 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'x'.repeat(200_000) }),
    });
    expect(res.statusCode).toBe(413);
  });

  test('an unexpected crash in a route answers 500 without its message', async () => {
    prismaMock.event.findMany.mockImplementation(() => { throw new TypeError('secret internals at db.internal'); });
    const res = await (await buildApp()).inject({ url: '/events', headers: KEY });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toMatch(/secret internals/);
  });

  test('a client flooding the API is rate limited with 429', async () => {
    const app = await buildApp();
    const codes = new Set<number>();
    for (let i = 0; i < 301; i++) codes.add((await app.inject('/health')).statusCode);
    expect(codes).toEqual(new Set([200, 429]));
  });

  test('the Telegram webhook is not rate limited (Telegram calls from few addresses)', async () => {
    const app = await buildApp();
    const codes = new Set<number>();
    for (let i = 0; i < 301; i++) {
      codes.add((await app.inject(webhook({ 'x-telegram-bot-api-secret-token': 'webhook_secret_value_1234' }, '{}'))).statusCode);
    }
    expect(codes).toEqual(new Set([200]));
  });
});
