import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

const late = vi.hoisted(() => ({ expectLateMinutes: vi.fn(), forgetLateMinutes: vi.fn() }));
vi.mock('./late.service.js', () => late);

import { handleCallbackQuery } from './telegram-callback.service.js';

const EVENT_ID = '3f2b8c1e-8a4d-4c55-9d7e-1b2c3d4e5f60';
const query = (data: string) => ({ id: 'q1', data, from: { id: 42, username: 'thrall' } });
const MAIN = { id: 'aaaaaaaa-1111-4111-8111-000000000001', name: 'Ulfgaar' };
const ALT = { id: 'bbbbbbbb-2222-4222-8222-000000000002', name: 'Kerlink' };

beforeEach(() => {
  resetPrismaMock();
  late.expectLateMinutes.mockReset();
  late.forgetLateMinutes.mockReset();
  prismaMock.identity.findUnique.mockResolvedValue({ userId: 'u1' });
  prismaMock.character.findMany.mockResolvedValue([MAIN]);
  prismaMock.character.count.mockImplementation(async (args: { where: { id: { in: string[] } } }) => args.where.id.in.length);
  prismaMock.response.findFirst.mockResolvedValue(null);
  prismaMock.event.findUnique.mockResolvedValue({ isPublished: false, startTime: new Date() });
  prismaMock.response.upsert.mockResolvedValue({});
});

const savedFor = () => prismaMock.response.upsert.mock.calls[0]![0].where.eventId_characterId.characterId;

describe('handleCallbackQuery: answering', () => {
  test('stores the answer for the main and confirms; one character means no extra message', async () => {
    const result = await handleCallbackQuery(query(`raid_tent_${EVENT_ID}`));

    expect(savedFor()).toBe(MAIN.id);
    expect(result.text).toContain('TENTATIVE');
    expect(result.register).toBeUndefined();
    expect(result.dm).toBeUndefined();
  });

  test('only approved characters are candidates: main first, then oldest', async () => {
    await handleCallbackQuery(query(`raid_in_${EVENT_ID}`));

    expect(prismaMock.character.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', inRoster: true },
      orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, name: true },
    });
  });

  test('looks the user up by Telegram identity, and never writes to the account', async () => {
    await handleCallbackQuery(query(`raid_in_${EVENT_ID}`));

    expect(prismaMock.identity.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { platform_platformUserId: { platform: 'telegram', platformUserId: '42' } } }),
    );
    expect(prismaMock.identity.upsert).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  test('with several approved characters the DM offers the others as buttons', async () => {
    prismaMock.character.findMany.mockResolvedValue([MAIN, ALT]);

    const result = await handleCallbackQuery(query(`raid_in_${EVENT_ID}`));

    expect(result.dm?.text).toMatch(/Ulfgaar/);
    expect(result.dm?.keyboard).toEqual({ inline_keyboard: [[{ text: 'Kerlink', callback_data: `as_bbbbbbbb_${EVENT_ID}` }]] });
  });

  test('a new tap keeps the character already answering for that event', async () => {
    prismaMock.character.findMany.mockResolvedValue([MAIN, ALT]);
    prismaMock.response.findFirst.mockResolvedValue({ characterId: ALT.id });

    const result = await handleCallbackQuery(query(`raid_out_${EVENT_ID}`));

    expect(prismaMock.response.findFirst).toHaveBeenCalledWith({
      where: { eventId: EVENT_ID, characterId: { in: [MAIN.id, ALT.id] } }, select: { characterId: true },
    });
    expect(savedFor()).toBe(ALT.id);
    expect(result.dm?.keyboard?.inline_keyboard).toEqual([[{ text: 'Ulfgaar', callback_data: `as_aaaaaaaa_${EVENT_ID}` }]]);
  });

  test('a Telegram account not linked to a site account is sent to link it', async () => {
    prismaMock.identity.findUnique.mockResolvedValue(null);

    const result = await handleCallbackQuery(query(`raid_in_${EVENT_ID}`));

    expect(result).toMatchObject({ register: true, text: expect.stringMatching(/link/i) });
    expect(prismaMock.response.upsert).not.toHaveBeenCalled();
  });

  test('no approved character: sent to the site, nothing saved', async () => {
    prismaMock.character.findMany.mockResolvedValue([]);

    const result = await handleCallbackQuery(query(`raid_in_${EVENT_ID}`));

    expect(result).toMatchObject({ register: true, text: expect.stringMatching(/approve/i) });
    expect(prismaMock.response.upsert).not.toHaveBeenCalled();
  });

  test('rejects malformed callback data without touching the database', async () => {
    for (const data of ['raid_in_not-a-uuid', `as_xyz_${EVENT_ID}`, `as_aaaaaaaaa_${EVENT_ID}`]) {
      expect((await handleCallbackQuery(query(data))).text).toMatch(/invalid/i);
    }
    expect(prismaMock.identity.findUnique).not.toHaveBeenCalled();
  });

  test('closed or missing events are reported; other errors are rethrown', async () => {
    prismaMock.event.findUnique.mockResolvedValue({ isPublished: true });
    expect((await handleCallbackQuery(query(`raid_out_${EVENT_ID}`))).text).toMatch(/closed/i);

    prismaMock.event.findUnique.mockResolvedValue(null);
    expect((await handleCallbackQuery(query(`raid_in_${EVENT_ID}`))).text).toMatch(/no longer exists/i);

    prismaMock.event.findUnique.mockRejectedValue(new Error('db down'));
    await expect(handleCallbackQuery(query(`raid_in_${EVENT_ID}`))).rejects.toThrow('db down');
  });

  describe('LATE', () => {
    test('saves LATE straight away, then asks for the minutes in the private chat', async () => {
      const result = await handleCallbackQuery(query(`raid_late_${EVENT_ID}`));

      expect(prismaMock.response.upsert.mock.calls[0]![0].create.status).toBe('LATE');
      expect(result.text).toMatch(/private chat/i);
      expect(result.dm?.text).toMatch(/how many minutes/i);
      expect(late.expectLateMinutes).toHaveBeenCalledWith(42, EVENT_ID, MAIN.id);
    });

    test('with several characters the minutes question and the buttons come in one message', async () => {
      prismaMock.character.findMany.mockResolvedValue([MAIN, ALT]);

      const result = await handleCallbackQuery(query(`raid_late_${EVENT_ID}`));

      expect(result.dm?.text).toMatch(/how many minutes[\s\S]*Ulfgaar/i);
      expect(result.dm?.keyboard).toBeDefined();
    });

    test('does not ask for minutes when sign-ups are closed', async () => {
      prismaMock.event.findUnique.mockResolvedValue({ isPublished: true });

      const result = await handleCallbackQuery(query(`raid_late_${EVENT_ID}`));

      expect(result.dm).toBeUndefined();
      expect(late.expectLateMinutes).not.toHaveBeenCalled();
    });

    test('the other buttons never open the question, and drop one an earlier LATE left open', async () => {
      await handleCallbackQuery(query(`raid_in_${EVENT_ID}`));
      expect(late.expectLateMinutes).not.toHaveBeenCalled();
      expect(late.forgetLateMinutes).toHaveBeenCalledWith(42);
    });
  });
});

describe('handleCallbackQuery: answering with another character (as_<index>)', () => {
  beforeEach(() => {
    prismaMock.character.findMany.mockResolvedValue([MAIN, ALT]);
    prismaMock.response.findFirst.mockResolvedValue({ characterId: MAIN.id });
    prismaMock.response.findUnique.mockResolvedValue({ id: 'r1', status: 'IN', isConfirmed: false, arrivalTime: null, note: null });
    prismaMock.$transaction.mockResolvedValue([]);
  });

  test('moves the answer to the chosen character', async () => {
    const result = await handleCallbackQuery(query(`as_bbbbbbbb_${EVENT_ID}`));

    expect(prismaMock.response.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ eventId: EVENT_ID, characterId: ALT.id, status: 'IN' }) }));
    expect(result.text).toMatch(/Kerlink/);
    expect(late.forgetLateMinutes).toHaveBeenCalledWith(42); // not waiting for minutes
  });

  test('a LATE answer still waiting for minutes keeps waiting, now for the new character', async () => {
    prismaMock.response.findUnique.mockResolvedValue({ id: 'r1', status: 'LATE', isConfirmed: false, arrivalTime: null, note: null });

    await handleCallbackQuery(query(`as_bbbbbbbb_${EVENT_ID}`));

    expect(late.expectLateMinutes).toHaveBeenCalledWith(42, EVENT_ID, ALT.id);
  });

  test('already answering with it: nothing changes', async () => {
    const result = await handleCallbackQuery(query(`as_aaaaaaaa_${EVENT_ID}`));

    expect(result.text).toMatch(/already/i);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  test('no answer yet, or a character no longer in the list', async () => {
    prismaMock.response.findFirst.mockResolvedValue(null);
    expect((await handleCallbackQuery(query(`as_bbbbbbbb_${EVENT_ID}`))).text).toMatch(/answer .*first/i);

    prismaMock.response.findFirst.mockResolvedValue({ characterId: MAIN.id });
    expect((await handleCallbackQuery(query(`as_cccccccc_${EVENT_ID}`))).text).toMatch(/no longer/i);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  test('sign-ups closed meanwhile', async () => {
    prismaMock.event.findUnique.mockResolvedValue({ isPublished: true });
    expect((await handleCallbackQuery(query(`as_bbbbbbbb_${EVENT_ID}`))).text).toMatch(/closed/i);
  });
});
