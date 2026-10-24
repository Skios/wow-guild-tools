import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));
vi.mock('../repositories/draft.repository.js', async () => (await import('../test/memory-drafts.js')).memoryDraftStore());

import { expectFollowUp, handleFollowUp, moveFollowUp } from './followup.service.js';

let nextId = 5000;
const player = () => ({ id: nextId++ });
const say = (from: { id: number }, text: string) => handleFollowUp({ from, text });
const expectLateMinutes = (id: number, eventId: string, characterId: string) => expectFollowUp(id, eventId, characterId, true);
const expectNote = (id: number, eventId: string, characterId: string) => expectFollowUp(id, eventId, characterId, false);
const start = new Date('2026-10-18T19:00:00Z');

afterEach(() => vi.useRealTimers());

// Before the events' start (19:00): answers are still open.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-18T10:00:00Z'));
  resetPrismaMock();
  prismaMock.event.findUnique.mockResolvedValue({ isPublished: false, startTime: start });
  prismaMock.response.upsert.mockResolvedValue({});
  prismaMock.character.count.mockResolvedValue(1);
  prismaMock.response.updateMany.mockResolvedValue({ count: 1 });
});

test('a character released or given to someone else meanwhile is not written to', async () => {
  const p = player();
  await expectLateMinutes(p.id, 'e1', 'c1');
  prismaMock.character.count.mockResolvedValue(0);

  expect((await say(p, '15'))?.text).toMatch(/no longer yours/);
  expect(prismaMock.character.count).toHaveBeenCalledWith({
    where: { id: 'c1', user: { identities: { some: { platform: 'telegram', platformUserId: String(p.id) } } } },
  });
  expect(prismaMock.response.upsert).not.toHaveBeenCalled();
});

describe('notes', () => {
  // updateMany also clears a note when the status changes ({ note: null }): only count notes written.
  const noteWritten = () => prismaMock.response.updateMany.mock.calls.map(c => c[0]).filter(c => c.data.note !== null);

  test('after IN / OUT / TENTATIVE the next message is the note', async () => {
    const p = player();
    await expectNote(p.id, 'e1', 'c1');

    expect((await say(p, '  leaving 30 min early '))?.text).toBe('Noted: note "leaving 30 min early".');
    expect(noteWritten()).toEqual([{ where: { eventId: 'e1', characterId: 'c1' }, data: { note: 'leaving 30 min early' } }]);
    expect(prismaMock.response.upsert).not.toHaveBeenCalled();
    expect(await say(p, 'more')).toBeNull(); // answered once
  });

  test('a number is just a note when the answer is not LATE', async () => {
    const p = player();
    await expectNote(p.id, 'e1', 'c1');
    await say(p, '15');
    expect(noteWritten()[0]!.data).toEqual({ note: '15' });
  });

  test('LATE: minutes and a note in one message', async () => {
    const p = player();
    await expectLateMinutes(p.id, 'e1', 'c1');

    expect((await say(p, '15 traffic on the way'))?.text).toBe('Noted: late by 15 min, note "traffic on the way".');
    expect(prismaMock.response.upsert.mock.calls[0]![0].update).toMatchObject({ status: 'LATE', arrivalTime: new Date(start.getTime() + 15 * 60_000) });
    expect(noteWritten()[0]!.data).toEqual({ note: 'traffic on the way' });
  });

  test('a note longer than 200 characters is refused and the question stays open', async () => {
    const p = player();
    await expectNote(p.id, 'e1', 'c1');

    expect((await say(p, 'x'.repeat(201)))?.text).toMatch(/at most 200/);
    expect(noteWritten()).toEqual([]);
    expect((await say(p, 'x'.repeat(200)))?.text).toMatch(/Noted/);
  });

  test('no answer to put the note on (removed meanwhile): told, question closed', async () => {
    const p = player();
    await expectNote(p.id, 'e1', 'c1');
    prismaMock.response.updateMany.mockResolvedValue({ count: 0 });

    expect((await say(p, 'hi'))?.text).toMatch(/no longer exists/);
    expect(await say(p, 'hi')).toBeNull();
  });

  test('moveFollowUp: an open question follows the answer to the new character; none is created otherwise', async () => {
    const p = player();
    await moveFollowUp(p.id, 'e1', 'c1', 'c2', false);
    expect(await say(p, 'hi')).toBeNull();

    await expectLateMinutes(p.id, 'e1', 'c1');
    await moveFollowUp(p.id, 'e1', 'c1', 'c2', false);
    await say(p, 'hi');
    expect(noteWritten()[0]!.where).toEqual({ eventId: 'e1', characterId: 'c2' });
  });

  test('moveFollowUp leaves alone a question about another event or character (an old button)', async () => {
    const p = player();
    await expectNote(p.id, 'e2', 'c1');
    await moveFollowUp(p.id, 'e1', 'c1', 'c2', true);
    await moveFollowUp(p.id, 'e2', 'c9', 'c2', true);

    await say(p, 'hi');
    expect(noteWritten()[0]!.where).toEqual({ eventId: 'e2', characterId: 'c1' });
    expect(prismaMock.response.upsert).not.toHaveBeenCalled();
  });

  test('LATE with minutes only writes no note', async () => {
    const p = player();
    await expectLateMinutes(p.id, 'e1', 'c1');
    expect((await say(p, '20'))?.text).toBe('Noted: late by 20 min.');
    expect(noteWritten()).toEqual([]);
  });
});

test('a character taken off the roster meanwhile: the player is told and the question closes', async () => {
  const p = player();
  await expectLateMinutes(p.id, 'e1', 'c1');
  prismaMock.character.count.mockResolvedValue(0);

  expect((await say(p, '15'))?.text).toMatch(/approved/);
  expect(await say(p, '15')).toBeNull();
});

describe('LATE: the minutes', () => {
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

  test.each([['0', /on time/i], ['720', /720 min/], [' 45 ', /45 min/], ['15 minutes', /15 min, note "minutes"/]])('accepts %j', async (text, expected) => {
    const me = player();
    expectLateMinutes(me.id, 'e1', 'c1');

    expect((await say(me, text))?.text).toMatch(expected);
  });

  test.each(['abc', '-5', '721', '1.5', '', '   ', 'traffic 15', '1e2', '０５', '0x10', '+15', '99999999999999999999'])(
    'asks again for %j and keeps waiting',
    async (text) => {
      const me = player();
      expectLateMinutes(me.id, 'e1', 'c1');

      expect((await say(me, text))?.text).toMatch(/Send the minutes/i);
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
