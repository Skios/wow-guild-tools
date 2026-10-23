import { beforeEach, describe, expect, test, vi } from 'vitest';

const telegram = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  getMe: vi.fn(),
  answerCbQuery: vi.fn(),
}));
const ctor = vi.hoisted(() => vi.fn());
vi.mock('telegraf', () => ({
  Telegraf: class {
    telegram = telegram;
    constructor(token: string) { ctor(token); }
  },
}));
vi.mock('../../config/telegram.js', () => ({
  telegramConfig: { token: '123:abc', channelId: '-100', webhookSecret: 'secret_value_1234567' },
}));

import { TelegramClient } from './telegram.client.js';

beforeEach(() => {
  vi.clearAllMocks();
  telegram.getMe.mockResolvedValue({ username: 'guild_bot' });
});

describe('TelegramClient', () => {
  test('creates the bot with the configured token', () => {
    new TelegramClient();
    expect(ctor).toHaveBeenCalledWith('123:abc');
  });

  test('sendMessage passes chat, text and extras through', async () => {
    await new TelegramClient().sendMessage('42', 'hi', { parse_mode: 'HTML' });
    expect(telegram.sendMessage).toHaveBeenCalledWith('42', 'hi', { parse_mode: 'HTML' });
  });

  test('sendMessage works without extras', async () => {
    await new TelegramClient().sendMessage('42', 'hi');
    expect(telegram.sendMessage).toHaveBeenCalledWith('42', 'hi', {});
  });

  test('sendInvite uses HTML and attaches the keyboard', async () => {
    const keyboard = { inline_keyboard: [] };
    await new TelegramClient().sendInvite('-100', 'hello', keyboard);
    expect(telegram.sendMessage).toHaveBeenCalledWith('-100', 'hello', { parse_mode: 'HTML', reply_markup: keyboard });
  });

  test('asks Telegram for the bot username only once', async () => {
    const client = new TelegramClient();

    expect(await client.getBotUsername()).toBe('guild_bot');
    expect(await client.getBotUsername()).toBe('guild_bot');
    expect(telegram.getMe).toHaveBeenCalledTimes(1);
  });

  test('does not cache a failed username lookup', async () => {
    telegram.getMe.mockRejectedValueOnce(new Error('network down'));
    const client = new TelegramClient();

    await expect(client.getBotUsername()).rejects.toThrow('network down');
    await expect(client.getBotUsername()).resolves.toBe('guild_bot');
  });

  test('answerCallback only sends a url when asked to', async () => {
    const client = new TelegramClient();

    await client.answerCallback('q1', 'ok');
    await client.answerCallback('q2', 'register', 'https://t.me/guild_bot?start=register');

    expect(telegram.answerCbQuery).toHaveBeenNthCalledWith(1, 'q1', 'ok', { show_alert: false });
    expect(telegram.answerCbQuery).toHaveBeenNthCalledWith(2, 'q2', 'register', {
      show_alert: false,
      url: 'https://t.me/guild_bot?start=register',
    });
  });

  test('getBot exposes the underlying bot', () => {
    const client = new TelegramClient();
    expect(client.getBot().telegram).toBe(telegram);
  });
});
