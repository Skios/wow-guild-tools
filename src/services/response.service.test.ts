import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

import { ConflictError, NotFoundError } from '../lib/errors.js';
import { EventLockedError, NotApprovedError, ResponseService } from './response.service.js';

beforeEach(() => {
  resetPrismaMock();
  prismaMock.event.findUnique.mockResolvedValue({ isPublished: false, startTime: new Date('2026-10-18T19:00:00Z') });
  prismaMock.response.upsert.mockImplementation(async (args: { create: object }) => ({ ...args.create }));
  // Every character asked about is on the roster unless a test says otherwise.
  prismaMock.character.count.mockImplementation(async (args: { where: { id: { in: string[] } } }) => args.where.id.in.length);
});

describe('notes', () => {
  test('a different answer clears the note (same transaction as the write); the same answer keeps it', async () => {
    await new ResponseService().updateResponse('e1', 'c1', 'OUT');

    expect(prismaMock.response.updateMany).toHaveBeenCalledWith({ where: { eventId: 'e1', characterId: 'c1', NOT: { status: 'OUT' } }, data: { note: null } });
    expect(prismaMock.response.upsert.mock.calls[0]![0].update).not.toHaveProperty('note');
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  test("officers changing someone's answer on the board clear the note the same way", async () => {
    await new ResponseService().bulkUpdateResponses('e1', [{ characterId: 'c1', status: 'BENCH', isConfirmed: false }]);

    expect(prismaMock.response.updateMany).toHaveBeenCalledWith({ where: { eventId: 'e1', characterId: 'c1', NOT: { status: 'BENCH' } }, data: { note: null } });
  });

  test('setNote writes the note on the existing answer', async () => {
    prismaMock.response.updateMany.mockResolvedValue({ count: 1 });

    await new ResponseService().setNote('e1', 'c1', 'leaving 30 min early');

    expect(prismaMock.response.updateMany).toHaveBeenCalledWith({ where: { eventId: 'e1', characterId: 'c1' }, data: { note: 'leaving 30 min early' } });
  });

  test('setNote without an answer is a 404; on a locked event or an unapproved character it is refused', async () => {
    prismaMock.response.updateMany.mockResolvedValue({ count: 0 });
    await expect(new ResponseService().setNote('e1', 'c1', 'x')).rejects.toBeInstanceOf(NotFoundError);

    prismaMock.character.count.mockResolvedValue(0);
    await expect(new ResponseService().setNote('e1', 'c1', 'x')).rejects.toBeInstanceOf(NotApprovedError);

    prismaMock.event.findUnique.mockResolvedValue({ isPublished: true });
    await expect(new ResponseService().setNote('e1', 'c1', 'x')).rejects.toBeInstanceOf(EventLockedError);
  });
});

describe('only characters on the roster (approved) answer', () => {
  test('a character waiting for approval is refused, nothing is written', async () => {
    prismaMock.character.count.mockResolvedValue(0);

    const error = await new ResponseService().updateResponse('e1', 'c1', 'IN').catch(e => e);

    expect(error).toBeInstanceOf(NotApprovedError);
    expect(error.status).toBe(409);
    expect(prismaMock.character.count).toHaveBeenCalledWith({ where: { id: { in: ['c1'] }, inRoster: true } });
    expect(prismaMock.response.upsert).not.toHaveBeenCalled();
  });

  test("officers' bulk edit is refused as a whole when one character is not approved", async () => {
    prismaMock.character.count.mockResolvedValue(1);

    await expect(new ResponseService().bulkUpdateResponses('e1', [
      { characterId: 'c1', status: 'IN', isConfirmed: true },
      { characterId: 'c2', status: 'OUT', isConfirmed: false },
    ])).rejects.toBeInstanceOf(NotApprovedError);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('ResponseService.moveResponse (the player answers with another character)', () => {
  test('moves status, arrival and note; the officer confirms again; a target answer is overwritten, never duplicated', async () => {
    const answer = { status: 'LATE', arrivalTime: new Date('2026-10-18T19:15:00Z'), note: 'traffic' };
    prismaMock.response.findUnique.mockResolvedValue({ id: 'r1', isConfirmed: true, ...answer });
    prismaMock.$transaction.mockResolvedValue([]);

    await new ResponseService().moveResponse('e1', 'main', 'alt');

    expect(prismaMock.response.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'e1', characterId: 'main' } });
    expect(prismaMock.response.upsert).toHaveBeenCalledWith({
      where: { eventId_characterId: { eventId: 'e1', characterId: 'alt' } },
      create: { eventId: 'e1', characterId: 'alt', ...answer, isConfirmed: false },
      update: { ...answer, isConfirmed: false },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  test('nothing to move when the first character never answered', async () => {
    prismaMock.response.findUnique.mockResolvedValue(null);

    await expect(new ResponseService().moveResponse('e1', 'main', 'alt')).rejects.toBeInstanceOf(NotFoundError);
  });

  test('the new character must be approved, and the event still open', async () => {
    prismaMock.character.count.mockResolvedValue(0);
    await expect(new ResponseService().moveResponse('e1', 'main', 'alt')).rejects.toBeInstanceOf(NotApprovedError);

    prismaMock.event.findUnique.mockResolvedValue({ isPublished: true });
    await expect(new ResponseService().moveResponse('e1', 'main', 'alt')).rejects.toBeInstanceOf(EventLockedError);
  });
});

describe('ResponseService.updateResponse', () => {
  test('does not reset isConfirmed when a member changes their answer', async () => {
    await new ResponseService().updateResponse('e1', 'c1', 'OUT');

    const call = prismaMock.response.upsert.mock.calls[0]![0];
    expect(call.update).toEqual({ status: 'OUT', arrivalTime: null });
    expect(call.create.isConfirmed).toBe(false);
  });

  test('an explicit isConfirmed is written on update and create', async () => {
    await new ResponseService().updateResponse('e1', 'c1', 'IN', true);

    const call = prismaMock.response.upsert.mock.calls[0]![0];
    expect(call.update).toEqual({ status: 'IN', isConfirmed: true, arrivalTime: null });
    expect(call.create.isConfirmed).toBe(true);
  });

  test('an explicit false un-confirms', async () => {
    await new ResponseService().updateResponse('e1', 'c1', 'BENCH', false);

    expect(prismaMock.response.upsert.mock.calls[0]![0].update).toEqual({ status: 'BENCH', isConfirmed: false, arrivalTime: null });
  });

  test('keys the response by event and character', async () => {
    await new ResponseService().updateResponse('e1', 'c1', 'IN');

    expect(prismaMock.response.upsert.mock.calls[0]![0].where).toEqual({
      eventId_characterId: { eventId: 'e1', characterId: 'c1' },
    });
  });

  test('404 for an event that does not exist, instead of a foreign key error', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);

    await expect(new ResponseService().updateResponse('ghost', 'c1', 'IN')).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.response.upsert).not.toHaveBeenCalled();
  });

  test('409 once the event is published', async () => {
    prismaMock.event.findUnique.mockResolvedValue({ isPublished: true });

    const error = await new ResponseService().updateResponse('e1', 'c1', 'IN').catch(e => e);

    expect(error).toBeInstanceOf(EventLockedError);
    expect(error).toBeInstanceOf(ConflictError);
    expect(prismaMock.response.upsert).not.toHaveBeenCalled();
  });
});

describe('late arrivals', () => {
  const start = new Date('2026-10-18T19:00:00Z');

  test('LATE with minutes stores the arrival time as event start + minutes', async () => {
    await new ResponseService().updateResponse('e1', 'c1', 'LATE', undefined, 20);

    const call = prismaMock.response.upsert.mock.calls[0]![0];
    expect(call.update.arrivalTime).toEqual(new Date(start.getTime() + 20 * 60_000));
    expect(call.create.arrivalTime).toEqual(new Date(start.getTime() + 20 * 60_000));
  });

  test('LATE for 0 minutes is on time, not "unknown"', async () => {
    await new ResponseService().updateResponse('e1', 'c1', 'LATE', undefined, 0);
    expect(prismaMock.response.upsert.mock.calls[0]![0].update.arrivalTime).toEqual(start);
  });

  test('LATE without minutes keeps whatever arrival time is already stored', async () => {
    await new ResponseService().updateResponse('e1', 'c1', 'LATE');

    const call = prismaMock.response.upsert.mock.calls[0]![0];
    expect(call.update).toEqual({ status: 'LATE' });
    expect(call.create.arrivalTime).toBeNull();
  });

  test.each(['IN', 'OUT', 'TENTATIVE', 'BENCH'] as const)('changing to %s forgets the arrival time', async (status) => {
    await new ResponseService().updateResponse('e1', 'c1', status, undefined, 30);
    expect(prismaMock.response.upsert.mock.calls[0]![0].update.arrivalTime).toBeNull();
  });

  test('the officer bulk save carries late minutes too', async () => {
    await new ResponseService().bulkUpdateResponses('e1', [
      { characterId: 'c1', status: 'LATE', isConfirmed: true, lateMinutes: 15 },
      { characterId: 'c2', status: 'IN', isConfirmed: false },
    ]);

    const [first, second] = prismaMock.response.upsert.mock.calls.map(c => c[0]);
    expect(first.update.arrivalTime).toEqual(new Date(start.getTime() + 15 * 60_000));
    expect(second.update.arrivalTime).toBeNull();
  });
});

describe('ResponseService.bulkUpdateResponses', () => {
  const selections = [
    { characterId: 'c1', status: 'IN' as const, isConfirmed: true },
    { characterId: 'c2', status: 'BENCH' as const, isConfirmed: false },
  ];

  test('writes every selection in one transaction', async () => {
    await new ResponseService().bulkUpdateResponses('e1', selections);

    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(prismaMock.response.upsert).toHaveBeenCalledTimes(2);
  });

  test('creates rows for characters that never answered, so officers can add anyone', async () => {
    await new ResponseService().bulkUpdateResponses('e1', selections);

    expect(prismaMock.response.upsert.mock.calls[1]![0].create).toEqual({
      eventId: 'e1', characterId: 'c2', status: 'BENCH', isConfirmed: false, arrivalTime: null,
    });
  });

  test('404 for an unknown event', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);

    await expect(new ResponseService().bulkUpdateResponses('ghost', selections)).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  test('409 once the event is published', async () => {
    prismaMock.event.findUnique.mockResolvedValue({ isPublished: true });

    await expect(new ResponseService().bulkUpdateResponses('e1', selections)).rejects.toBeInstanceOf(EventLockedError);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  test('a failing write rejects the whole call', async () => {
    prismaMock.$transaction.mockRejectedValue(new Error('FK violation'));

    await expect(new ResponseService().bulkUpdateResponses('e1', selections)).rejects.toThrow('FK violation');
  });

  test('an empty selection is a no-op transaction', async () => {
    await new ResponseService().bulkUpdateResponses('e1', []);

    expect(prismaMock.response.upsert).not.toHaveBeenCalled();
  });
});
