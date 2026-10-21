import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

import { DRAFT_TTL_MS, draftStore } from './draft.repository.js';

const NOW = new Date('2026-10-21T20:00:00Z');
const store = draftStore<{ step: string }>('registration');
const key = { kind_platform_platformUserId: { kind: 'registration', platform: 'telegram', platformUserId: '42' } };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetPrismaMock();
});
afterEach(() => vi.useRealTimers());

describe('draftStore', () => {
  test('reads a live draft for that chat user and kind', async () => {
    prismaMock.chatDraft.findUnique.mockResolvedValue({ data: { step: 'realm' }, expiresAt: new Date(NOW.getTime() + 1000) });

    await expect(store.get(42)).resolves.toEqual({ step: 'realm' });
    expect(prismaMock.chatDraft.findUnique).toHaveBeenCalledWith({ where: key });
  });

  test('a missing draft is undefined', async () => {
    prismaMock.chatDraft.findUnique.mockResolvedValue(null);
    await expect(store.get(42)).resolves.toBeUndefined();
  });

  test('an expired draft counts as missing (an old half-finished chat must not resurface)', async () => {
    prismaMock.chatDraft.findUnique.mockResolvedValue({ data: { step: 'realm' }, expiresAt: NOW });
    await expect(store.get(42)).resolves.toBeUndefined();
  });

  test('saving creates or replaces the draft and pushes its expiry forward', async () => {
    await store.set(42, { step: 'class' });

    const expiresAt = new Date(NOW.getTime() + DRAFT_TTL_MS);
    expect(prismaMock.chatDraft.upsert).toHaveBeenCalledWith({
      where: key,
      create: { kind: 'registration', platform: 'telegram', platformUserId: '42', data: { step: 'class' }, expiresAt },
      update: { data: { step: 'class' }, expiresAt },
    });
  });

  test('deleting is idempotent (deleteMany, no error when there is nothing)', async () => {
    prismaMock.chatDraft.deleteMany.mockResolvedValue({ count: 0 });

    await expect(store.delete(42)).resolves.toBeUndefined();
    expect(prismaMock.chatDraft.deleteMany).toHaveBeenCalledWith({ where: { kind: 'registration', platform: 'telegram', platformUserId: '42' } });
  });

  test('kinds do not see each other: a late question is not a registration draft', async () => {
    await draftStore('late').get(42);
    expect(prismaMock.chatDraft.findUnique).toHaveBeenCalledWith({
      where: { kind_platform_platformUserId: { kind: 'late', platform: 'telegram', platformUserId: '42' } },
    });
  });

  test('drafts last 30 minutes', () => {
    expect(DRAFT_TTL_MS).toBe(30 * 60_000);
  });
});
