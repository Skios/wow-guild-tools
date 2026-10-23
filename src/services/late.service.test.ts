import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));
vi.mock('../repositories/draft.repository.js', async () => (await import('../test/memory-drafts.js')).memoryDraftStore());

import { expectLateMinutes, handleLateMessage } from './late.service.js';

let nextId = 5000;
const player = () => ({ id: nextId++ });
const say = (from: { id: number }, text: string) => handleLateMessage({ from, text });
const start = new Date('2026-10-18T19:00:00Z');

beforeEach(() => {
  resetPrismaMock();
  prismaMock.event.findUnique.mockResolvedValue({ isPublished: false, startTime: start });
  prismaMock.response.upsert.mockResolvedValue({});
});

describe('late follow-up', () => {
  test('ignores people who were not asked for minutes, so other handlers can answer them', async () => {
    expect(await say(player(), '15')).toBeNull();
    expect(prismaMock.response.upsert).not.toHaveBeenCalled();
  });

  test('stores the delay as an arrival time and thanks the player', async () => {
    const me = player();
    expectLateMinutes(me.id, 'e1', 'c1');

    const reply = await say(me, '15');

    expect(reply?.text).toMatch(/15 min/);
    const call = prismaMock.response.upsert.mock.calls[0]![0];
    expect(call.where).toEqual({ eventId_characterId: { eventId: 'e1', characterId: 'c1' } });
    expect(call.update).toMatchObject({ status: 'LATE', arrivalTime: new Date(start.getTime() + 15 * 60_000) });
  });

  test.each([['0', /on time/i], ['720', /720 min/], [' 45 ', /45 min/]])('accepts %j', async (text, expected) => {
    const me = player();
    expectLateMinutes(me.id, 'e1', 'c1');

    expect((await say(me, text))?.text).toMatch(expected);
  });

  test.each(['abc', '-5', '721', '1.5', '', '   ', '15 minutes', '1e2', '０５', '0x10', '+15', '99999999999999999999'])(
    'asks again for %j and keeps waiting',
    async (text) => {
      const me = player();
      expectLateMinutes(me.id, 'e1', 'c1');

      expect((await say(me, text))?.text).toMatch(/number of minutes/i);
      expect(prismaMock.response.upsert).not.toHaveBeenCalled();

      expect((await say(me, '10'))?.text).toMatch(/10 min/); // still waiting
    },
  );

  test('stops waiting after a valid answer', async () => {
    const me = player();
    expectLateMinutes(me.id, 'e1', 'c1');
    await say(me, '10');

    expect(await say(me, '20')).toBeNull();
  });

  test('a command abandons the question and is left for the other handlers', async () => {
    const me = player();
    expectLateMinutes(me.id, 'e1', 'c1');

    expect(await say(me, '/start')).toBeNull();
    expect(await say(me, '15')).toBeNull();
  });

  test('asking again replaces the previous question', async () => {
    const me = player();
    expectLateMinutes(me.id, 'e1', 'c1');
    expectLateMinutes(me.id, 'e2', 'c1');

    await say(me, '5');

    expect(prismaMock.response.upsert.mock.calls[0]![0].where.eventId_characterId.eventId).toBe('e2');
  });

  test('two players waiting at the same time do not mix up', async () => {
    const a = player();
    const b = player();
    expectLateMinutes(a.id, 'e1', 'ca');
    expectLateMinutes(b.id, 'e1', 'cb');

    await say(b, '30');
    await say(a, '5');

    const written = prismaMock.response.upsert.mock.calls.map(c => [c[0].where.eventId_characterId.characterId, c[0].update.arrivalTime]);
    expect(written).toEqual([
      ['cb', new Date(start.getTime() + 30 * 60_000)],
      ['ca', new Date(start.getTime() + 5 * 60_000)],
    ]);
  });

  test('tells the player when the roster was published while they were answering', async () => {
    const me = player();
    expectLateMinutes(me.id, 'e1', 'c1');
    prismaMock.event.findUnique.mockResolvedValue({ isPublished: true, startTime: start });

    expect((await say(me, '10'))?.text).toMatch(/closed/i);
    expect(await say(me, '10')).toBeNull(); // no longer waiting
  });

  test('tells the player when the event disappeared', async () => {
    const me = player();
    expectLateMinutes(me.id, 'e1', 'c1');
    prismaMock.event.findUnique.mockResolvedValue(null);

    expect((await say(me, '10'))?.text).toMatch(/no longer exists|not found/i);
  });

  test('unexpected database errors are not swallowed, and the player can retry', async () => {
    const me = player();
    expectLateMinutes(me.id, 'e1', 'c1');
    prismaMock.response.upsert.mockRejectedValueOnce(new Error('db down'));

    await expect(say(me, '10')).rejects.toThrow('db down');
    expect((await say(me, '10'))?.text).toMatch(/10 min/);
  });
});
