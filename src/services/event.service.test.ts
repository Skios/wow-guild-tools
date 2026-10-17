import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

const adapter = vi.hoisted(() => ({ sendInvite: vi.fn(), publishFinalRoster: vi.fn() }));
vi.mock('../integrations/telegram/telegram.adapter.js', () => ({
  TelegramAdapter: class {
    name = 'telegram';
    sendInvite = adapter.sendInvite;
    publishFinalRoster = adapter.publishFinalRoster;
  },
}));

import { ConflictError, NotFoundError } from '../lib/errors.js';
import { EventService } from './event.service.js';

const startTime = new Date('2026-10-18T19:00:00Z');
const event = { id: 'e1', title: 'Raid', startTime, description: null, responses: [] };
const row = (name: string, status: string, isConfirmed: boolean, role = 'DPS') => ({
  status,
  isConfirmed,
  character: { name, role },
});

const input = {
  title: 'Raid',
  startTime: '2026-10-18T19:00:00Z',
  endTime: '2026-10-18T22:00:00Z',
  createdByUserId: 'u1',
};

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
  adapter.sendInvite.mockResolvedValue({ success: true });
  adapter.publishFinalRoster.mockResolvedValue({ success: true });
});

describe('EventService.createEvent', () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1' });
    prismaMock.event.create.mockResolvedValue({ ...event });
  });

  test('creates the event and sends the invite', async () => {
    const created = await new EventService().createEvent(input);

    expect(created.id).toBe('e1');
    expect(prismaMock.event.create).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(adapter.sendInvite).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'e1' })));
  });

  test('refuses an unknown creator before writing anything', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(new EventService().createEvent(input)).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });

  test('refuses an end time that is not after the start, even if called without the validator', async () => {
    await expect(new EventService().createEvent({ ...input, endTime: input.startTime })).rejects.toThrow(/after start/i);
    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });

  test('still returns the event when the invite throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    adapter.sendInvite.mockRejectedValue(new Error('telegram down'));

    await expect(new EventService().createEvent(input)).resolves.toMatchObject({ id: 'e1' });
    spy.mockRestore();
  });

  test('still returns the event when the invite reports failure', async () => {
    adapter.sendInvite.mockResolvedValue({ success: false, error: '429' });

    await expect(new EventService().createEvent(input)).resolves.toMatchObject({ id: 'e1' });
  });

  test('propagates database failures', async () => {
    prismaMock.event.create.mockRejectedValue(new Error('db down'));

    await expect(new EventService().createEvent(input)).rejects.toThrow('db down');
  });
});

describe('EventService.getEvent', () => {
  test('returns the event', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event);
    await expect(new EventService().getEvent('e1')).resolves.toEqual(event);
  });

  test('throws NotFoundError for an unknown event', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    await expect(new EventService().getEvent('nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('EventService.listEvents', () => {
  test('summarises responses per event instead of returning every row', async () => {
    prismaMock.event.findMany.mockResolvedValue([
      {
        ...event,
        responses: [
          { status: 'IN', isConfirmed: true },
          { status: 'IN', isConfirmed: false },
          { status: 'OUT', isConfirmed: false },
          { status: 'TENTATIVE', isConfirmed: false },
          { status: 'BENCH', isConfirmed: false },
          { status: 'IN', isConfirmed: true },
        ],
      },
    ]);

    const [listed] = await new EventService().listEvents(20, 0);

    expect(listed).not.toHaveProperty('responses');
    expect(listed!.counts).toEqual({ in: 3, out: 1, tentative: 1, bench: 1, confirmed: 2 });
  });

  test('returns zero counts for an event nobody answered', async () => {
    prismaMock.event.findMany.mockResolvedValue([event]);

    const [listed] = await new EventService().listEvents(20, 0);

    expect(listed!.counts).toEqual({ in: 0, out: 0, tentative: 0, bench: 0, confirmed: 0 });
  });

  test('passes pagination to the database and returns an empty list as is', async () => {
    prismaMock.event.findMany.mockResolvedValue([]);

    await expect(new EventService().listEvents(5, 10)).resolves.toEqual([]);
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5, skip: 10 }));
  });
});

describe('EventService.publishEvent', () => {
  beforeEach(() => {
    prismaMock.event.findUnique.mockResolvedValue(event);
    prismaMock.event.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.response.findMany.mockResolvedValue([
      row('Tank', 'IN', true, 'TANK'),
      row('Maybe', 'IN', false),
      row('Bench', 'BENCH', false),
      row('Out', 'OUT', false),
      row('Tent', 'TENTATIVE', false),
    ]);
  });

  test('team = confirmed IN, bench = unconfirmed IN + BENCH (sorted); OUT and TENTATIVE are left out', async () => {
    await new EventService().publishEvent('e1');

    expect(adapter.publishFinalRoster).toHaveBeenCalledWith(
      expect.objectContaining({ roster: { team: ['Tank'], bench: ['Bench', 'Maybe'] } }),
    );
  });

  test('orders the team tank, healer, melee, ranged and then by name', async () => {
    prismaMock.response.findMany.mockResolvedValue([
      row('Zed', 'IN', true, 'RANGED_DPS'),
      row('Bob', 'IN', true, 'DPS'),
      row('Amy', 'IN', true, 'DPS'),
      row('Cleo', 'IN', true, 'HEALER'),
      row('Tom', 'IN', true, 'TANK'),
    ]);

    await new EventService().publishEvent('e1');

    expect(adapter.publishFinalRoster.mock.calls[0]![0].roster.team).toEqual(['Tom', 'Cleo', 'Amy', 'Bob', 'Zed']);
  });

  test('404 for an unknown event, without locking anything', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);

    await expect(new EventService().publishEvent('nope')).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.event.updateMany).not.toHaveBeenCalled();
  });

  test('409 when already published, and does not post a second time', async () => {
    prismaMock.event.updateMany.mockResolvedValue({ count: 0 });

    await expect(new EventService().publishEvent('e1')).rejects.toBeInstanceOf(ConflictError);
    expect(adapter.publishFinalRoster).not.toHaveBeenCalled();
  });

  test('refuses to publish with nobody confirmed, and unlocks the event', async () => {
    prismaMock.response.findMany.mockResolvedValue([row('Maybe', 'IN', false), row('Out', 'OUT', false)]);

    await expect(new EventService().publishEvent('e1')).rejects.toThrow(/confirm/i);
    expect(prismaMock.event.updateMany).toHaveBeenLastCalledWith({ where: { id: 'e1' }, data: { isPublished: false } });
    expect(adapter.publishFinalRoster).not.toHaveBeenCalled();
  });

  test('refuses to publish an event nobody answered', async () => {
    prismaMock.response.findMany.mockResolvedValue([]);

    await expect(new EventService().publishEvent('e1')).rejects.toBeInstanceOf(ConflictError);
  });

  test('unlocks the event when every channel reports failure', async () => {
    adapter.publishFinalRoster.mockResolvedValue({ success: false, error: 'boom' });

    await expect(new EventService().publishEvent('e1')).rejects.toThrow('Publication failed');
    expect(prismaMock.event.updateMany).toHaveBeenLastCalledWith({ where: { id: 'e1' }, data: { isPublished: false } });
  });

  test('unlocks the event when the channel throws instead of returning an error', async () => {
    adapter.publishFinalRoster.mockRejectedValue(new Error('socket hang up'));

    await expect(new EventService().publishEvent('e1')).rejects.toThrow();
    expect(prismaMock.event.updateMany).toHaveBeenLastCalledWith({ where: { id: 'e1' }, data: { isPublished: false } });
  });

  test('unlocks the event when reading responses fails', async () => {
    prismaMock.response.findMany.mockRejectedValue(new Error('db down'));

    await expect(new EventService().publishEvent('e1')).rejects.toThrow('db down');
    expect(prismaMock.event.updateMany).toHaveBeenLastCalledWith({ where: { id: 'e1' }, data: { isPublished: false } });
  });

  test('reports success once the message reached at least one channel', async () => {
    await expect(new EventService().publishEvent('e1')).resolves.toMatchObject({ published: true });
  });

  test('two simultaneous publishes post once', async () => {
    prismaMock.event.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValue({ count: 0 });
    const service = new EventService();

    const results = await Promise.allSettled([service.publishEvent('e1'), service.publishEvent('e1')]);

    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(adapter.publishFinalRoster).toHaveBeenCalledTimes(1);
  });
});
