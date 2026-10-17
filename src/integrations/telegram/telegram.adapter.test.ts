import { beforeEach, describe, expect, test, vi } from 'vitest';

const client = vi.hoisted(() => ({
  sendInvite: vi.fn(),
  sendMessage: vi.fn(),
  getBotUsername: vi.fn(),
}));
vi.mock('./telegram.client.js', () => ({ TelegramClient: class { constructor() { return client; } } }));
vi.mock('../../config/telegram.js', () => ({ telegramConfig: { channelId: '-100' } }));

import { TelegramAdapter } from './telegram.adapter.js';

describe('TelegramAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.getBotUsername.mockResolvedValue('guild_bot');
    client.sendInvite.mockResolvedValue({});
    client.sendMessage.mockResolvedValue({});
  });

  test('invite has answer buttons and a register link to the bot', async () => {
    await new TelegramAdapter().sendInvite({ eventId: 'e1', eventTitle: 'Raid', startTime: new Date() });

    const keyboard = client.sendInvite.mock.calls[0]![2];
    const buttons = keyboard.inline_keyboard.flat();
    expect(buttons.map((b: { callback_data?: string }) => b.callback_data).filter(Boolean)).toEqual([
      'raid_in_e1', 'raid_out_e1', 'raid_tent_e1',
    ]);
    expect(buttons.find((b: { url?: string }) => b.url)?.url).toBe('https://t.me/guild_bot?start=register');
  });

  test('escapes HTML in event titles', async () => {
    await new TelegramAdapter().sendInvite({ eventId: 'e1', eventTitle: '<b>Raid</b> & co', startTime: new Date() });

    expect(client.sendInvite.mock.calls[0]![1]).toContain('&lt;b&gt;Raid&lt;/b&gt; &amp; co');
  });

  test('final roster survives character names with markdown characters', async () => {
    const result = await new TelegramAdapter().publishFinalRoster({
      eventId: 'e1', eventTitle: 'Raid', startTime: new Date(),
      roster: { team: ['Dark_Knight*'], bench: [] },
    });

    expect(result.success).toBe(true);
    expect(client.sendMessage).toHaveBeenCalledWith('-100', expect.stringContaining('Dark_Knight*'), { parse_mode: 'HTML' });
  });

  test('reports failures instead of throwing', async () => {
    client.sendInvite.mockRejectedValue(new Error('429'));

    const result = await new TelegramAdapter().sendInvite({ eventId: 'e1', eventTitle: 'Raid', startTime: new Date() });

    expect(result).toEqual({ success: false, error: '429' });
  });
});
