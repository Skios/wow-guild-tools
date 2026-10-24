import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

import { DashboardService } from './dashboard.service.js';

const NOW = new Date('2026-10-24T12:00:00Z');
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
const MAIN = { id: 'c-main', name: 'Ulfgaar', class: 'WARRIOR', spec: 'PROTECTION', role: 'TANK' };
const ALT = { id: 'c-alt', name: 'Kerlink', class: 'MAGE', spec: 'FIRE', role: 'RANGED_DPS' };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetPrismaMock();
  prismaMock.character.count.mockImplementation(async (args: { where: { id: { in: string[] } } }) => args.where.id?.in.length ?? 0);
  prismaMock.event.findUnique.mockResolvedValue({ isPublished: false, startTime: inHours(30) });
});
afterEach(() => vi.useRealTimers());

describe('my next events', () => {
  test('upcoming events (published ones too, read-only) with my answer, and my approved characters main first', async () => {
    prismaMock.character.findMany.mockResolvedValue([MAIN, ALT]);
    prismaMock.event.findMany.mockResolvedValue([
      { id: 'e1', title: 'Raid', startTime: inHours(30), endTime: inHours(33), isPublished: false },
      { id: 'e2', title: 'Alt run', startTime: inHours(2), endTime: inHours(5), isPublished: true },
    ]);
    prismaMock.response.findMany.mockResolvedValue([{ eventId: 'e2', characterId: 'c-alt', status: 'IN', isConfirmed: true, arrivalTime: null, note: 'bring food' }]);

    const mine = await new DashboardService().myEvents('u1');

    expect(prismaMock.character.findMany.mock.calls[0]![0]).toMatchObject({ where: { userId: 'u1', inRoster: true }, orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }] });
    expect(prismaMock.event.findMany.mock.calls[0]![0].where).toEqual({ endTime: { gt: NOW } });
    expect(mine.characters).toEqual([MAIN, ALT]);
    expect(mine.events.map(e => [e.id, e.answer?.characterId ?? null])).toEqual([['e1', null], ['e2', 'c-alt']]);
  });

  test('no approved character: the events still show, nothing to look up', async () => {
    prismaMock.character.findMany.mockResolvedValue([]);
    prismaMock.event.findMany.mockResolvedValue([{ id: 'e1', title: 'Raid', startTime: inHours(30), endTime: inHours(33), isPublished: false }]);

    expect((await new DashboardService().myEvents('u1')).events[0]!.answer).toBeNull();
    expect(prismaMock.response.findMany).not.toHaveBeenCalled();
  });
});

describe('answering from the dashboard', () => {
  beforeEach(() => {
    prismaMock.character.findFirst.mockResolvedValue({ id: 'c-main' });
    prismaMock.response.findFirst.mockResolvedValue(null);
    prismaMock.response.upsert.mockResolvedValue({});
    prismaMock.response.updateMany.mockResolvedValue({ count: 1 });
  });

  test('answers with my character, with the minutes for LATE and the note', async () => {
    await new DashboardService().answer('u1', 'e1', { characterId: 'c-main', status: 'LATE', lateMinutes: 15, note: 'traffic' });

    expect(prismaMock.character.findFirst).toHaveBeenCalledWith({ where: { id: 'c-main', userId: 'u1', inRoster: true }, select: { id: true } });
    expect(prismaMock.response.upsert.mock.calls[0]![0].create).toMatchObject({ characterId: 'c-main', status: 'LATE', arrivalTime: new Date(inHours(30).getTime() + 15 * 60_000) });
    expect(prismaMock.response.updateMany).toHaveBeenLastCalledWith({ where: { eventId: 'e1', characterId: 'c-main' }, data: { note: 'traffic' } });
  });

  test('an empty note clears it; no note leaves it alone', async () => {
    await new DashboardService().answer('u1', 'e1', { characterId: 'c-main', status: 'IN', note: '' });
    expect(prismaMock.response.updateMany).toHaveBeenLastCalledWith({ where: { eventId: 'e1', characterId: 'c-main' }, data: { note: null } });

    prismaMock.response.updateMany.mockClear();
    await new DashboardService().answer('u1', 'e1', { characterId: 'c-main', status: 'IN' });
    expect(prismaMock.response.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: { note: expect.anything() } }));
  });

  test('already answering with another of my characters: the answer moves first', async () => {
    prismaMock.response.findFirst.mockResolvedValue({ characterId: 'c-alt' });
    prismaMock.response.findUnique.mockResolvedValue({ id: 'r1', status: 'IN', isConfirmed: false, arrivalTime: null, note: null });

    await new DashboardService().answer('u1', 'e1', { characterId: 'c-main', status: 'OUT' });

    expect(prismaMock.response.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'e1', characterId: 'c-alt' } });
  });

  test('a published event refuses the answer (409)', async () => {
    prismaMock.event.findUnique.mockResolvedValue({ isPublished: true, startTime: inHours(30) });

    await expect(new DashboardService().answer('u1', 'e1', { characterId: 'c-main', status: 'IN' })).rejects.toMatchObject({ status: 409 });
    expect(prismaMock.response.upsert).not.toHaveBeenCalled();
  });

  test("someone else's character, or one not approved, is refused", async () => {
    prismaMock.character.findFirst.mockResolvedValue(null);

    await expect(new DashboardService().answer('u1', 'e1', { characterId: 'c-other', status: 'IN' })).rejects.toMatchObject({ status: 404 });
    expect(prismaMock.response.upsert).not.toHaveBeenCalled();
  });
});

describe('officers: composition of the open events', () => {
  test('confirmed per role played, no answers, the target in use and the next reminder', async () => {
    prismaMock.event.findMany.mockResolvedValue([{
      id: 'e1', title: 'Raid', startTime: inHours(30), roleTarget: null,
      responses: [
        { status: 'IN', isConfirmed: true, spec: null, character: { id: 'c0', userId: 'u0', class: 'WARRIOR', role: 'TANK', inRoster: true } },
        { status: 'LATE', isConfirmed: true, spec: 'SHADOW', character: { id: 'c1', userId: 'u1', class: 'PRIEST', role: 'HEALER', inRoster: true } },
        { status: 'IN', isConfirmed: false, spec: null, character: { id: 'c2', userId: 'u2', class: 'MAGE', role: 'RANGED_DPS', inRoster: true } },
      ],
      reminders: [{ minutesBefore: 1440 }, { minutesBefore: 480 }],
    }]);
    // 10 players, plus u0's alt: still 7 left once 3 players answered.
    prismaMock.character.findMany.mockResolvedValue([...Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, userId: `u${i}` })), { id: 'alt0', userId: 'u0' }]);

    const [row] = await new DashboardService().composition();

    expect(row).toMatchObject({
      id: 'e1', confirmed: 2, byRole: { TANK: 1, HEALER: 0, DPS: 0, RANGED_DPS: 1 }, noAnswer: 7,
      roleTarget: { mode: 'flex', tanks: 2, healersPer5: 1, meleeShare: 50 },
      nextReminder: inHours(6),
    });
  });
});

describe('officers: to do', () => {
  test('characters waiting, events starting within a day not published, players without Telegram', async () => {
    prismaMock.character.count.mockResolvedValue(3);
    prismaMock.event.findMany.mockResolvedValue([{ id: 'e1', title: 'Raid', startTime: inHours(5) }]);
    prismaMock.user.findMany.mockResolvedValue([{ id: 'u9', username: 'quiet', nickname: 'Shh' }]);

    const todo = await new DashboardService().todo(['roster.approve', 'events.manage']);

    expect(todo).toEqual({ pendingApprovals: 3, toPublish: [{ id: 'e1', title: 'Raid', startTime: inHours(5) }], noTelegram: [{ id: 'u9', name: 'Shh' }] });
    expect(prismaMock.event.findMany.mock.calls[0]![0].where).toEqual({ isPublished: false, canceledAt: null, startTime: { gt: NOW, lte: inHours(24) } });
  });

  test('only what the role covers', async () => {
    prismaMock.character.count.mockResolvedValue(3);
    expect(await new DashboardService().todo(['roster.approve'])).toEqual({ pendingApprovals: 3 });
    expect(prismaMock.event.findMany).not.toHaveBeenCalled();
  });
});

describe('officers: attendance', () => {
  const players = [{ id: 'u1', username: 'ulf', nickname: 'Matte' }, { id: 'u2', username: 'kel', nickname: null }];
  const answer = (eventId: string, userId: string, status: string, isConfirmed = false) => ({ eventId, status, isConfirmed, character: { userId } });

  beforeEach(() => {
    prismaMock.user.findMany.mockResolvedValue(players);
    prismaMock.event.findMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }]);
  });

  test('per player over the last N published events: played, late, bench (also unconfirmed), out, tentative, no answer', async () => {
    prismaMock.response.findMany.mockResolvedValue([
      answer('e1', 'u1', 'IN', true), answer('e2', 'u1', 'LATE', true), answer('e3', 'u1', 'IN', false),
      answer('e1', 'u2', 'BENCH'), answer('e2', 'u2', 'OUT'),
    ]);

    const result = await new DashboardService().attendance(3);

    expect(prismaMock.event.findMany.mock.calls[0]![0]).toMatchObject({ where: { isPublished: true }, orderBy: { startTime: 'desc' }, take: 3 });
    expect(result).toEqual({
      span: 3, events: 3,
      players: [
        { id: 'u2', name: 'kel', in: 0, late: 0, bench: 1, out: 1, tentative: 0, noAnswer: 1 },
        { id: 'u1', name: 'Matte', in: 1, late: 1, bench: 1, out: 0, tentative: 0, noAnswer: 0 },
      ],
    });
  });

  test('two characters in one event count once, the best answer; an unconfirmed LATE was benched', async () => {
    prismaMock.event.findMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);
    prismaMock.response.findMany.mockResolvedValue([
      answer('e1', 'u1', 'OUT'), answer('e1', 'u1', 'TENTATIVE'),
      answer('e2', 'u1', 'LATE', false),
    ]);

    const [, matte] = (await new DashboardService().attendance(2)).players;

    expect(matte).toMatchObject({ tentative: 1, out: 0, bench: 1, noAnswer: 0 });
  });

  test('the whole season counts published events since the last "New season"', async () => {
    prismaMock.setting.findUnique.mockResolvedValue({ key: 'seasonStart', value: '2026-09-01T00:00:00.000Z' });
    prismaMock.response.findMany.mockResolvedValue([]);

    const result = await new DashboardService().attendance('season');

    expect(prismaMock.event.findMany.mock.calls[0]![0].where).toEqual({ isPublished: true, canceledAt: null, startTime: { lte: NOW, gte: new Date('2026-09-01T00:00:00.000Z') } });
    expect(prismaMock.event.findMany.mock.calls[0]![0]).not.toHaveProperty('take');
    expect(result.span).toBe('season');
  });

  test('no season started yet: every published event', async () => {
    prismaMock.setting.findUnique.mockResolvedValue(null);
    prismaMock.response.findMany.mockResolvedValue([]);

    await new DashboardService().attendance('season');

    expect(prismaMock.event.findMany.mock.calls[0]![0].where).toEqual({ isPublished: true, canceledAt: null, startTime: { lte: NOW } });
  });
});
