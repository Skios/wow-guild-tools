import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

import { ConflictError, NotFoundError } from '../lib/errors.js';
import { EventLockedError, ResponseService } from './response.service.js';

beforeEach(() => {
  resetPrismaMock();
  prismaMock.event.findUnique.mockResolvedValue({ isPublished: false });
  prismaMock.response.upsert.mockImplementation(async (args: { create: object }) => ({ ...args.create }));
});

describe('ResponseService.updateResponse', () => {
  test('does not reset isConfirmed when a member changes their answer', async () => {
    await new ResponseService().updateResponse('e1', 'c1', 'OUT');

    const call = prismaMock.response.upsert.mock.calls[0]![0];
    expect(call.update).toEqual({ status: 'OUT' });
    expect(call.create.isConfirmed).toBe(false);
  });

  test('an explicit isConfirmed is written on update and create', async () => {
    await new ResponseService().updateResponse('e1', 'c1', 'IN', true);

    const call = prismaMock.response.upsert.mock.calls[0]![0];
    expect(call.update).toEqual({ status: 'IN', isConfirmed: true });
    expect(call.create.isConfirmed).toBe(true);
  });

  test('an explicit false un-confirms', async () => {
    await new ResponseService().updateResponse('e1', 'c1', 'BENCH', false);

    expect(prismaMock.response.upsert.mock.calls[0]![0].update).toEqual({ status: 'BENCH', isConfirmed: false });
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
      eventId: 'e1', characterId: 'c2', status: 'BENCH', isConfirmed: false,
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
