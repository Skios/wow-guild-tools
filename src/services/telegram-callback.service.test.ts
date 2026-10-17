import { beforeEach, describe, expect, test, vi } from 'vitest';

const db = vi.hoisted(() => ({
  identity: { upsert: vi.fn() },
  character: { findFirst: vi.fn() },
  event: { findUnique: vi.fn() },
  response: { upsert: vi.fn() },
}));
vi.mock('../config/db.js', () => ({ prisma: db }));

import { handleCallbackQuery } from './telegram-callback.service.js';

const EVENT_ID = '3f2b8c1e-8a4d-4c55-9d7e-1b2c3d4e5f60';
const query = (data: string) => ({ id: 'q1', data, from: { id: 42, username: 'thrall' } });

describe('handleCallbackQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.identity.upsert.mockResolvedValue({ user: { id: 'u1' } });
    db.character.findFirst.mockResolvedValue({ id: 'c1' });
    db.event.findUnique.mockResolvedValue({ isPublished: false });
    db.response.upsert.mockResolvedValue({});
  });

  test('stores the response for the main character and confirms to the user', async () => {
    const result = await handleCallbackQuery(query(`raid_tent_${EVENT_ID}`));

    expect(db.response.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId_characterId: { eventId: EVENT_ID, characterId: 'c1' } } }),
    );
    expect(result.text).toContain('TENTATIVE');
    expect(result.register).toBeUndefined();
  });

  test('looks the user up by Telegram identity', async () => {
    await handleCallbackQuery(query(`raid_in_${EVENT_ID}`));

    expect(db.identity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { platform_platformUserId: { platform: 'telegram', platformUserId: '42' } } }),
    );
  });

  test('rejects malformed callback data without touching the database', async () => {
    const result = await handleCallbackQuery(query('raid_in_not-a-uuid'));

    expect(result.text).toMatch(/invalid/i);
    expect(db.identity.upsert).not.toHaveBeenCalled();
  });

  test('sends a user without a main character to registration', async () => {
    db.character.findFirst.mockResolvedValue(null);

    const result = await handleCallbackQuery(query(`raid_in_${EVENT_ID}`));

    expect(result.register).toBe(true);
    expect(result.text).toMatch(/register/i);
    expect(db.response.upsert).not.toHaveBeenCalled();
  });

  test('tells the user when the event is already published', async () => {
    db.event.findUnique.mockResolvedValue({ isPublished: true });

    const result = await handleCallbackQuery(query(`raid_out_${EVENT_ID}`));

    expect(result.text).toMatch(/closed/i);
  });

  test('rethrows unexpected database errors', async () => {
    db.event.findUnique.mockRejectedValue(new Error('db down'));

    await expect(handleCallbackQuery(query(`raid_in_${EVENT_ID}`))).rejects.toThrow('db down');
  });
});
