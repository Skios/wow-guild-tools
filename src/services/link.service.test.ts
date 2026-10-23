import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

import { linkKey, signLinkToken, verifyLinkToken } from '../domain/link-token.js';
import { handleReset, handleStart, linkTelegram, unlinkTelegram } from './link.service.js';

const KEY = linkKey('k');
const ACCOUNT = '3f2b8c1e-8a4d-4c55-9d7e-000000000001';
const config = { key: KEY, siteUrl: 'https://guild.example' };

beforeEach(() => {
  resetPrismaMock();
  prismaMock.user.findUnique.mockResolvedValue({ username: 'ulfgaar' });
});

describe('linkTelegram', () => {
  test('links a Telegram nobody has to an account without one', async () => {
    await linkTelegram(ACCOUNT, '42');

    expect(prismaMock.identity.upsert).toHaveBeenCalledWith({
      where: { platform_platformUserId: { platform: 'telegram', platformUserId: '42' } },
      update: { userId: ACCOUNT },
      create: { platform: 'telegram', platformUserId: '42', userId: ACCOUNT },
    });
  });

  test('takes it from a Telegram-only player row (no login)', async () => {
    prismaMock.identity.findUnique.mockResolvedValue({ userId: 'old-bot-row', user: { identities: [] } });
    await linkTelegram(ACCOUNT, '42');
    expect(prismaMock.identity.upsert).toHaveBeenCalled();
  });

  test('linking the same pair again changes nothing', async () => {
    prismaMock.identity.findUnique.mockResolvedValue({ userId: ACCOUNT, user: { identities: [{ id: 's' }] } });
    await linkTelegram(ACCOUNT, '42');
    expect(prismaMock.identity.upsert).not.toHaveBeenCalled();
  });

  test('never replaces: an account with another Telegram must unlink first', async () => {
    prismaMock.identity.findFirst.mockResolvedValue({ platformUserId: '99' });
    await expect(linkTelegram(ACCOUNT, '42')).rejects.toThrow(/unlink/);
    expect(prismaMock.identity.upsert).not.toHaveBeenCalled();
  });

  test("never steals: another account's Telegram is refused", async () => {
    prismaMock.identity.findUnique.mockResolvedValue({ userId: 'someone-else', user: { identities: [{ id: 's' }] } });
    await expect(linkTelegram(ACCOUNT, '42')).rejects.toThrow(/another account/);
    expect(prismaMock.identity.upsert).not.toHaveBeenCalled();
  });

  test('unlink drops the account\'s Telegram', async () => {
    await unlinkTelegram(ACCOUNT);
    expect(prismaMock.identity.deleteMany).toHaveBeenCalledWith({ where: { userId: ACCOUNT, platform: 'telegram' } });
  });
});

describe('handleStart (the bot\'s /start)', () => {
  test('without a link, replies with a site link that carries this Telegram account', async () => {
    const reply = await handleStart({ id: 42 }, '', config);

    const url = /https:\/\/guild\.example\/link\?t=([A-Za-z0-9_-]+)/.exec(reply.text);
    expect(url).not.toBeNull();
    expect(verifyLinkToken(url![1]!, KEY)).toMatchObject({ kind: 'telegram', id: '42' });
  });

  test('a site link for an account that already has a Telegram is refused with the reason', async () => {
    prismaMock.identity.findFirst.mockResolvedValue({ platformUserId: '99' });
    const reply = await handleStart({ id: 42 }, `l${signLinkToken({ kind: 'account', id: ACCOUNT }, KEY)}`, config);
    expect(reply.text).toMatch(/unlink/);
  });

  test('a payload that is not a link (e.g. the old "register") gets the normal welcome', async () => {
    const reply = await handleStart({ id: 42 }, 'register', config);
    expect(reply.text).toMatch(/guild\.example\/link\?t=/);
  });

  test('an already linked Telegram is told which account it belongs to', async () => {
    prismaMock.identity.findUnique.mockResolvedValue({ user: { username: 'ulfgaar' } });
    const reply = await handleStart({ id: 42 }, '', config);
    expect(reply.text).toMatch(/linked to ulfgaar/);
  });

  test('a link from the site (start=l<token>) links this Telegram to that account', async () => {
    const reply = await handleStart({ id: 42 }, `l${signLinkToken({ kind: 'account', id: ACCOUNT }, KEY)}`, config);

    expect(prismaMock.identity.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ userId: ACCOUNT, platformUserId: '42' }) }));
    expect(reply.text).toMatch(/Linked to ulfgaar/);
  });

  test.each([
    ['expired or forged', `l${'A'.repeat(50)}`],
    ['a Telegram token used backwards', `l${signLinkToken({ kind: 'telegram', id: '42' }, KEY)}`],
  ])('a %s link links nothing', async (_label, param) => {
    const reply = await handleStart({ id: 42 }, param, config);
    expect(reply.text).toMatch(/expired/i);
    expect(prismaMock.identity.upsert).not.toHaveBeenCalled();
  });

  test('a linked account that no longer exists is reported, not crashed on', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const reply = await handleStart({ id: 42 }, `l${signLinkToken({ kind: 'account', id: ACCOUNT }, KEY)}`, config);
    expect(reply.text).toMatch(/expired/i);
    expect(prismaMock.identity.upsert).not.toHaveBeenCalled();
  });

  test('without the API key or the site address, it says so instead of sending a broken link', async () => {
    expect((await handleStart({ id: 42 }, '', { key: null, siteUrl: 'https://guild.example' })).text).toMatch(/not set up/i);
    expect((await handleStart({ id: 42 }, '', { key: KEY, siteUrl: undefined })).text).toMatch(/not set up/i);
  });
});

describe('handleReset (the bot\'s /reset)', () => {
  test('sends a password-reset link for the account this Telegram belongs to', async () => {
    prismaMock.identity.findUnique.mockResolvedValue({ userId: ACCOUNT });

    const reply = await handleReset({ id: 42 }, config);

    const token = /https:\/\/guild\.example\/reset\?t=([A-Za-z0-9_-]+)/.exec(reply.text)?.[1];
    expect(verifyLinkToken(token!, KEY)).toMatchObject({ kind: 'reset', id: ACCOUNT });
  });

  test('an unlinked Telegram is told to link first', async () => {
    prismaMock.identity.findUnique.mockResolvedValue(null);
    expect((await handleReset({ id: 42 }, config)).text).toMatch(/\/start/);
  });

  test('without the key or the site address it says so', async () => {
    prismaMock.identity.findUnique.mockResolvedValue({ userId: ACCOUNT });
    expect((await handleReset({ id: 42 }, { key: null, siteUrl: 'https://guild.example' })).text).toMatch(/not set up/i);
  });
});
