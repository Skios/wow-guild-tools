import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';
import { buildRouteAppFor, uuid } from '../test/helpers.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

import { linkKey, signLinkToken, verifyLinkToken } from '../domain/link-token.js';
import { linkRoutes } from './link.controller.js';

const KEY = linkKey('k');
const ME = uuid(1);
const botUsername = vi.fn();
const app = (key: Buffer | null = KEY) =>
  buildRouteAppFor({ role: 'Raider', position: 40 }, linkRoutes({ config: () => ({ key, siteUrl: 'https://guild.example' }), botUsername }));

beforeEach(() => {
  resetPrismaMock();
  botUsername.mockReset().mockResolvedValue('guild_bot');
});

describe('GET /me/telegram', () => {
  test('says whether Telegram is linked, and makes no link', async () => {
    prismaMock.identity.findFirst.mockResolvedValue({ id: 'i1' });

    expect((await (await app()).inject('/me/telegram')).json()).toEqual({ linked: true });
    expect(prismaMock.identity.findFirst).toHaveBeenCalledWith({ where: { userId: ME, platform: 'telegram' }, select: { id: true } });
    expect(botUsername).not.toHaveBeenCalled();
  });
});

describe('POST /me/telegram/bot-link', () => {
  test('gives a t.me link that links this account when opened', async () => {
    const body = (await (await app()).inject({ method: 'POST', url: '/me/telegram/bot-link' })).json();

    const token = /^https:\/\/t\.me\/guild_bot\?start=l([A-Za-z0-9_-]+)$/.exec(body.url)?.[1];
    expect(verifyLinkToken(token!, KEY)).toEqual({ kind: 'account', id: ME });
  });

  test('is 503 when the bot or the key is unavailable', async () => {
    botUsername.mockRejectedValue(new Error('down'));
    expect((await (await app()).inject({ method: 'POST', url: '/me/telegram/bot-link' })).statusCode).toBe(503);
    expect((await (await app(null)).inject({ method: 'POST', url: '/me/telegram/bot-link' })).statusCode).toBe(503);
  });
});

describe('DELETE /me/telegram', () => {
  test('unlinks my Telegram', async () => {
    const res = await (await app()).inject({ method: 'DELETE', url: '/me/telegram' });
    expect(res.statusCode).toBe(204);
    expect(prismaMock.identity.deleteMany).toHaveBeenCalledWith({ where: { userId: ME, platform: 'telegram' } });
  });
});

describe('POST /me/telegram', () => {
  test('a link from the bot links that Telegram to me', async () => {
    const token = signLinkToken({ kind: 'telegram', id: '42' }, KEY);

    const res = await (await app()).inject({ method: 'POST', url: '/me/telegram', payload: { token } });

    expect(res.statusCode).toBe(204);
    expect(prismaMock.identity.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { platform: 'telegram', platformUserId: '42', userId: ME } }));
  });

  test.each([
    ['expired or forged', 'A'.repeat(50)],
    ['an account token', signLinkToken({ kind: 'account', id: ME }, KEY)],
  ])('an %s token is a 400 that says to ask the bot again', async (_label, token) => {
    const res = await (await app()).inject({ method: 'POST', url: '/me/telegram', payload: { token } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/\/start/);
    expect(prismaMock.identity.upsert).not.toHaveBeenCalled();
  });

  test('my account already having a Telegram is a 409 that says to unlink first', async () => {
    prismaMock.identity.findFirst.mockResolvedValue({ platformUserId: '99' });
    const token = signLinkToken({ kind: 'telegram', id: '42' }, KEY);
    const res = await (await app()).inject({ method: 'POST', url: '/me/telegram', payload: { token } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/unlink/);
  });

  test('is 503 without the key', async () => {
    const res = await (await app(null)).inject({ method: 'POST', url: '/me/telegram', payload: { token: 'x' } });
    expect(res.statusCode).toBe(503);
  });
});
