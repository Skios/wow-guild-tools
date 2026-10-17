import { describe, expect, test, vi } from 'vitest';
import type { NotificationAdapter } from '../types/notification.types.js';
import { NotificationService } from './notification.service.js';

const adapter = (name: string, overrides: Partial<NotificationAdapter> = {}): NotificationAdapter => ({
  name,
  sendInvite: vi.fn().mockResolvedValue({ success: true }),
  publishFinalRoster: vi.fn().mockResolvedValue({ success: true }),
  ...overrides,
});
const invite = { eventId: 'e1', eventTitle: 'Raid', startTime: new Date() };
const roster = { ...invite, roster: { team: ['A'], bench: [] } };

const direct = { text: 'Hello', eventId: 'e1' };

describe('NotificationService.sendDirect', () => {
  test('hands the message to the channel with that name', async () => {
    const service = new NotificationService();
    const telegram = adapter('telegram', { sendDirect: vi.fn().mockResolvedValue({ success: true }) });
    service.registerAdapter(telegram);

    await expect(service.sendDirect('telegram', '42', direct)).resolves.toEqual({ success: true });
    expect(telegram.sendDirect).toHaveBeenCalledWith('42', direct);
  });

  test('reports a missing channel instead of throwing', async () => {
    const result = await new NotificationService().sendDirect('discord', '42', direct);
    expect(result).toEqual({ success: false, error: 'No discord channel configured' });
  });

  test('reports a channel that cannot send direct messages', async () => {
    const service = new NotificationService();
    service.registerAdapter(adapter('telegram'));
    expect((await service.sendDirect('telegram', '42', direct)).success).toBe(false);
  });

  test('turns a thrown error into a failure result', async () => {
    const service = new NotificationService();
    service.registerAdapter(adapter('telegram', { sendDirect: vi.fn().mockRejectedValue(new Error('blocked by user')) }));
    expect(await service.sendDirect('telegram', '42', direct)).toEqual({ success: false, error: 'blocked by user' });
  });
});

describe('NotificationService', () => {
  test('with no channel configured, there is nothing to report', async () => {
    const service = new NotificationService();
    await expect(service.notifyEventCreated(invite)).resolves.toEqual([]);
    await expect(service.publishFinalRoster(roster)).resolves.toEqual([]);
  });

  test('sends to every registered channel and labels each result', async () => {
    const service = new NotificationService();
    service.registerAdapter(adapter('telegram'));
    service.registerAdapter(adapter('discord', { sendInvite: vi.fn().mockResolvedValue({ success: false, error: '429' }) }));

    await expect(service.notifyEventCreated(invite)).resolves.toEqual([
      { adapter: 'telegram', success: true },
      { adapter: 'discord', success: false, error: '429' },
    ]);
  });

  test('a channel that throws does not stop the others', async () => {
    const service = new NotificationService();
    const ok = adapter('telegram');
    service.registerAdapter(adapter('discord', { publishFinalRoster: vi.fn().mockRejectedValue(new Error('socket hang up')) }));
    service.registerAdapter(ok);

    const results = await service.publishFinalRoster(roster);

    expect(results).toEqual([
      { adapter: 'discord', success: false, error: 'socket hang up' },
      { adapter: 'telegram', success: true },
    ]);
    expect(ok.publishFinalRoster).toHaveBeenCalledWith(roster);
  });

  test('copes with channels that throw something that is not an Error', async () => {
    const service = new NotificationService();
    service.registerAdapter(adapter('x', { sendInvite: vi.fn().mockRejectedValue('boom') }));

    await expect(service.notifyEventCreated(invite)).resolves.toEqual([{ adapter: 'x', success: false, error: 'Unknown error' }]);
  });

  test('registering the same channel twice keeps only the latest', async () => {
    const service = new NotificationService();
    const first = adapter('telegram');
    const second = adapter('telegram');
    service.registerAdapter(first);
    service.registerAdapter(second);

    await service.notifyEventCreated(invite);

    expect(first.sendInvite).not.toHaveBeenCalled();
    expect(second.sendInvite).toHaveBeenCalledOnce();
  });
});
