import { beforeEach, describe, expect, test, vi } from 'vitest';

const db = vi.hoisted(() => ({
  event: { findUnique: vi.fn(), updateMany: vi.fn() },
  response: { findMany: vi.fn() },
}));
vi.mock('../config/db.js', () => ({ prisma: db }));

const sendFinal = vi.hoisted(() => vi.fn());
vi.mock('../integrations/telegram/telegram.adapter.js', () => ({
  TelegramAdapter: class {
    name = 'telegram';
    sendInvite = vi.fn();
    publishFinalRoster = sendFinal;
  },
}));

import { EventService } from './event.service.js';

const event = { id: 'e1', title: 'Raid', startTime: new Date(), description: null };
const responses = [
  { status: 'IN', isConfirmed: true, character: { name: 'Tank' } },
  { status: 'IN', isConfirmed: false, character: { name: 'Maybe' } },
  { status: 'BENCH', isConfirmed: false, character: { name: 'Bench' } },
  { status: 'OUT', isConfirmed: false, character: { name: 'Out' } },
];

describe('EventService.publishEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.event.findUnique.mockResolvedValue({ ...event, responses: [] });
    db.event.updateMany.mockResolvedValue({ count: 1 });
    db.response.findMany.mockResolvedValue(responses);
    sendFinal.mockResolvedValue({ success: true });
  });

  test('publishes confirmed players as team and the rest of IN/BENCH as bench', async () => {
    await new EventService().publishEvent('e1');

    expect(sendFinal).toHaveBeenCalledWith(
      expect.objectContaining({ roster: { team: ['Tank'], bench: ['Maybe', 'Bench'] } }),
    );
  });

  test('throws when the event is already published, without posting again', async () => {
    db.event.updateMany.mockResolvedValue({ count: 0 });

    await expect(new EventService().publishEvent('e1')).rejects.toThrow('already published');
    expect(sendFinal).not.toHaveBeenCalled();
  });

  test('unlocks the event when every channel fails', async () => {
    sendFinal.mockResolvedValue({ success: false, error: 'boom' });

    await expect(new EventService().publishEvent('e1')).rejects.toThrow('Publication failed');
    expect(db.event.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'e1' },
      data: { isPublished: false },
    });
  });
});
