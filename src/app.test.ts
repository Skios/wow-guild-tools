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

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildApp as realBuildApp } from './app.js';
import { knownCapabilities } from './domain/roles.js';
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
  prismaMock.identity.findUnique.mockResolvedValue({ user: { id: 'u1', username: 'Brannock', role: OFFICER, mustChangePassword: false } });
});

const OFFICER = { name: 'Officer', position: 20, isOwner: false, capabilities: ['roster.manage', 'roster.approve', 'events.manage', 'messages.send', 'accounts.manage'] };

describe('buildApp', () => {
  test('health check is public', async () => {
    const res = await (await buildApp()).inject('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  test.each([
    ['GET', '/api/events'],
    ['POST', '/api/events'],
    ['GET', `/api/events/${ID}`],
    ['PATCH', `/api/events/${ID}/roster`],
    ['POST', `/api/events/${ID}/publish`],
    ['GET', '/api/groups'],
    ['POST', '/api/groups'],
    ['GET', `/api/groups/${ID}`],
    ['DELETE', `/api/groups/${ID}`],
    ['POST', `/api/groups/${ID}/members`],
    ['DELETE', `/api/groups/${ID}/members/${ID}`],
    ['GET', '/api/me/profile'],
    ['PUT', '/api/me/profile'],
    ['POST', '/api/me/characters'],
    ['POST', `/api/me/characters/${ID}/claim`],
    ['DELETE', `/api/me/characters/${ID}`],
    ['GET', '/api/characters/search?q=ulf'],
    ['GET', '/api/roster/pending'],
    ['POST', `/api/roster/${ID}/approve`],
    ['POST', '/api/roster/new-season'],
    ['GET', '/api/roster'],
    ['POST', '/api/roster'],
    ['PUT', `/api/roster/${ID}`],
    ['DELETE', `/api/roster/${ID}`],
    ['POST', `/api/roster/${ID}/release`],
    ['POST', `/api/events/${ID}/message`],
    ['GET', '/api/meta/wow'],
    ['GET', '/api/auth/me'],
    ['GET', '/api/roles'],
    ['POST', '/api/roles'],
    ['PUT', `/api/users/${ID}/role`],
    ['GET', '/api/users'],
    ['POST', `/api/users/${ID}/password-reset`],
    ['POST', '/api/auth/password'],
    ['GET', '/api/me/telegram'],
    ['POST', '/api/me/telegram'],
    ['DELETE', '/api/me/telegram'],
    ['POST', '/api/me/telegram/bot-link'],
    ['POST', '/api/me/password-reset-link'],
  ] as const)('%s %s needs an officer login', async (method, url) => {
    const app = await buildApp();

    expect((await app.inject({ method, url })).statusCode).toBe(401);
    expect((await app.inject({ method, url, headers: { authorization: 'Bearer nope.nope.nope' } })).statusCode).toBe(401);
    expect((await app.inject({ method, url, headers: { 'x-api-key': 'a_long_random_api_key_1234' } })).statusCode).toBe(401);

    prismaMock.identity.findUnique.mockResolvedValue({ user: { id: 'u2', username: 'Rando', role: null } });
    expect((await app.inject({ method, url, headers: KEY })).statusCode).toBe(403);
    prismaMock.identity.findUnique.mockResolvedValue(null);
    expect((await app.inject({ method, url, headers: KEY })).statusCode).toBe(403);
  });

  test('with a temporary password only "who am I" and changing the password are open', async () => {
    prismaMock.identity.findUnique.mockResolvedValue({ user: { id: 'u1', username: 'Brannock', role: OFFICER, mustChangePassword: true } });
    const app = await buildApp();

    expect((await app.inject({ url: '/api/events', headers: KEY })).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/roster', headers: KEY })).statusCode).toBe(403);
    const me = await app.inject({ url: '/api/auth/me', headers: KEY });
    expect(me.statusCode).toBe(200);
    expect(me.json().mustChangePassword).toBe(true);
    // Reaches the route (503: this test app has no Supabase secret key), not the 403 lock.
    expect((await app.inject({ method: 'POST', url: '/api/auth/password', headers: KEY, payload: { currentPassword: 'y', password: 'x' } })).statusCode).toBe(503);
  });

  test('the token is not accepted from the query string', async () => {
    const token = KEY.authorization.slice('Bearer '.length);
    expect((await (await buildApp()).inject(`/api/events?access_token=${token}`)).statusCode).toBe(401);
  });

  test('GET /auth/me says which officer is signed in', async () => {
    const res = await (await buildApp()).inject({ url: '/api/auth/me', headers: KEY });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      userId: 'u1', username: 'Brannock', role: 'Officer', position: 20, isOwner: false, mustChangePassword: false,
      capabilities: ['accounts.manage', 'events.manage', 'messages.send', 'roster.approve', 'roster.manage'],
    });
  });

  test('an officer login opens officer routes', async () => {
    prismaMock.event.findMany.mockResolvedValue([]);
    const res = await (await buildApp()).inject({ url: '/api/events', headers: KEY });
    expect(res.statusCode).toBe(200);
  });

  test('the webhook is guarded by its own secret, not the officer login', async () => {
    const app = await buildApp();
    const body = { update_id: 1 };

    expect((await app.inject({ method: 'POST', url: '/api/webhooks/telegram', payload: body, headers: KEY })).statusCode).toBe(401);
    expect((await app.inject({
      method: 'POST', url: '/api/webhooks/telegram', payload: body,
      headers: { 'x-telegram-bot-api-secret-token': 'webhook_secret_value_1234' },
    })).statusCode).toBe(200);
  });

  test('unknown routes are 404 (and unauthenticated probing learns nothing about officer routes)', async () => {
    const app = await buildApp();
    expect((await app.inject('/api/nope')).statusCode).toBe(404);
  });
});

describe('POST /api/signup', () => {
  const signup = vi.fn();
  const withAccounts = () => realBuildApp({ verifyToken: supabaseTokenVerifier(SUPABASE_URL, signer.jwks), accounts: { signup } as never });
  const body = { username: 'ulfgaar', password: 'Correct-horse1' };
  beforeEach(() => signup.mockReset().mockResolvedValue({ name: 'ulfgaar' }));

  test('needs no login and creates the account', async () => {
    const res = await (await withAccounts()).inject({ method: 'POST', url: '/api/signup', payload: body });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ name: 'ulfgaar' });
    expect(signup).toHaveBeenCalledWith('ulfgaar', 'Correct-horse1', undefined);
  });

  test('an expired Telegram link is refused before creating anything', async () => {
    const res = await (await withAccounts()).inject({ method: 'POST', url: '/api/signup', payload: { ...body, link: 'A'.repeat(50) } });
    expect(res.statusCode).toBe(400);
    expect(signup).not.toHaveBeenCalled();
  });

  test('a body that is not an object is a 400', async () => {
    const res = await (await withAccounts()).inject({ method: 'POST', url: '/api/signup', payload: '"x"', headers: { 'content-type': 'application/json' } });
    expect(res.statusCode).toBe(400);
    expect(signup).not.toHaveBeenCalled();
  });

  test('is 503 when the API has no Supabase secret key', async () => {
    const res = await (await buildApp()).inject({ method: 'POST', url: '/api/signup', payload: body });
    expect(res.statusCode).toBe(503);
  });

  test('is rate-limited much harder than the rest (account spam)', async () => {
    const app = await withAccounts();
    const codes = [];
    for (let i = 0; i < 11; i++) codes.push((await app.inject({ method: 'POST', url: '/api/signup', payload: body })).statusCode);
    expect(codes.slice(0, 10).every(code => code === 201)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});

describe('POST /api/auth/reset (the link from the bot)', () => {
  const resetWithLink = vi.fn();
  const withAccounts = () => realBuildApp({ verifyToken: supabaseTokenVerifier(SUPABASE_URL, signer.jwks), accounts: { resetWithLink } as never });

  test('needs no login, and an invalid or expired link changes nothing', async () => {
    const res = await (await withAccounts()).inject({ method: 'POST', url: '/api/auth/reset', payload: { token: 'A'.repeat(50), password: 'Correct-horse1' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/expired/);
    expect(resetWithLink).not.toHaveBeenCalled();
  });
});

describe('raid leaders (roster.approve only)', () => {
  const RAID_LEADER = { name: 'Raidleader', position: 30, isOwner: false, capabilities: ['events.manage', 'messages.send', 'roster.approve'] };
  const asRaidLeader = () =>
    prismaMock.identity.findUnique.mockResolvedValue({ user: { id: 'u3', username: 'Rl', role: RAID_LEADER, mustChangePassword: false } });

  test.each([
    ['POST', '/api/roster/new-season'],
    ['POST', '/api/roster'],
    ['DELETE', `/api/roster/${ID}`],
    ['PUT', `/api/roster/${ID}/owner`],
  ] as const)('cannot edit the roster: %s %s is 403', async (method, url) => {
    asRaidLeader();
    const res = await (await buildApp()).inject({ method, url, headers: KEY, payload: { confirm: 'NEW SEASON' } });
    expect(res.statusCode).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  test('can read the roster and the pending list', async () => {
    asRaidLeader();
    prismaMock.character.findMany.mockResolvedValue([]);
    const app = await buildApp();
    expect((await app.inject({ url: '/api/roster', headers: KEY })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/roster/pending', headers: KEY })).statusCode).toBe(200);
  });
});

describe('capabilities', () => {
  // Capabilities are registered by the routes that check them. A new or renamed one shows up here.
  test('the routes register exactly these', async () => {
    await buildApp();
    expect(knownCapabilities()).toEqual(['accounts.manage', 'events.manage', 'messages.send', 'roster.approve', 'roster.manage']);
  });

  // Replays what the migrations store in "roles"."capabilities": seeds (ARRAY[...]), array_replace, array_remove, array_append.
  // A capability renamed in the code without a migration that renames it in the roles fails here.
  test('every capability the migrations store in roles still exists in the code', async () => {
    await buildApp();
    const dir = join(import.meta.dirname, '../prisma/migrations');
    const sql = readdirSync(dir).filter(name => !name.endsWith('.toml')).sort()
      .map(name => readFileSync(join(dir, name, 'migration.sql'), 'utf8')).join('\n');
    const stored = new Set<string>();
    const ops = /INSERT INTO "roles"[\s\S]*?;|array_replace\("capabilities", '([^']+)', '([^']+)'\)|array_remove\("capabilities", '([^']+)'\)|array_append\("capabilities", '([^']+)'\)/g;
    for (const [match, from, to, removed, added] of sql.matchAll(ops)) {
      if (from && to) { if (stored.delete(from)) stored.add(to); }
      else if (removed) stored.delete(removed);
      else if (added) stored.add(added);
      else for (const [, name] of match.matchAll(/'([a-z]+(?:\.[a-z]+)+)'/g)) stored.add(name!);
    }
    expect(stored.size).toBeGreaterThan(0);
    expect([...stored].filter(name => !knownCapabilities().includes(name))).toEqual([]);
  });
});

describe('buildApp routing', () => {
  test.each(['/health', '/events', '/webhooks/telegram'])('nothing is served outside /api (%s is 404)', async (url) => {
    const res = await (await buildApp()).inject({ url, headers: KEY });
    expect(res.statusCode).toBe(404);
  });
});

describe('buildApp hardening', () => {
  const webhook = (headers: Record<string, string>, payload: string) =>
    ({ method: 'POST' as const, url: '/api/webhooks/telegram', headers: { 'content-type': 'application/json', ...headers }, payload });

  test('rejects a webhook call without the secret before reading the body', async () => {
    const res = await (await buildApp()).inject(webhook({}, '{not json'));
    expect(res.statusCode).toBe(401);
  });

  test('malformed JSON is a 400 with a safe message', async () => {
    const res = await (await buildApp()).inject({
      method: 'POST', url: '/api/roster', headers: { ...KEY, 'content-type': 'application/json' }, payload: '{not json',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: expect.any(String) });
  });

  test('bodies over the limit are refused with 413', async () => {
    const res = await (await buildApp()).inject({
      method: 'POST', url: '/api/roster', headers: { ...KEY, 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'x'.repeat(200_000) }),
    });
    expect(res.statusCode).toBe(413);
  });

  test('an unexpected crash in a route answers 500 without its message', async () => {
    prismaMock.event.findMany.mockImplementation(() => { throw new TypeError('secret internals at db.internal'); });
    const res = await (await buildApp()).inject({ url: '/api/events', headers: KEY });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toMatch(/secret internals/);
  });

  test('a client flooding the API is rate limited with 429', async () => {
    const app = await buildApp();
    const codes = new Set<number>();
    for (let i = 0; i < 301; i++) codes.add((await app.inject('/api/health')).statusCode);
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
