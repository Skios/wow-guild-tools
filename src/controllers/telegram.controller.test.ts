import Fastify from 'fastify';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const handle = vi.hoisted(() => vi.fn());
const answer = vi.hoisted(() => vi.fn());
const send = vi.hoisted(() => vi.fn());
const regMessage = vi.hoisted(() => vi.fn());
const regCallback = vi.hoisted(() => vi.fn());
const botUsername = vi.hoisted(() => vi.fn());
const lateMessage = vi.hoisted(() => vi.fn());
vi.mock('../services/telegram-callback.service.js', async (orig) => ({
  ...(await orig<object>()),
  handleCallbackQuery: handle,
}));
vi.mock('../services/late.service.js', () => ({ handleLateMessage: lateMessage }));
vi.mock('../services/registration.service.js', () => ({
  handleRegistrationMessage: regMessage,
  handleRegistrationCallback: regCallback,
}));
vi.mock('../integrations/telegram/telegram.client.js', () => ({
  TelegramClient: class {
    answerCallback = answer;
    sendMessage = send;
    getBotUsername = botUsername;
  },
}));
vi.mock('../config/telegram.js', () => ({
  telegramConfig: { token: 't', channelId: 'c', webhookSecret: 's3cret_token_value' },
}));

import { telegramRoutes } from './telegram.controller.js';

const body = { update_id: 1, callback_query: { id: 'q1', data: 'raid_in_x', from: { id: 42 } } };

async function app() {
  const fastify = Fastify();
  await fastify.register(telegramRoutes);
  return fastify;
}

describe('POST /webhooks/telegram', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handle.mockResolvedValue({ text: 'Saved' });
    send.mockResolvedValue({});
    botUsername.mockResolvedValue('guild_bot');
    lateMessage.mockResolvedValue(null);
    answer.mockResolvedValue(true);
  });

  test('rejects requests without the secret header', async () => {
    const res = await (await app()).inject({ method: 'POST', url: '/webhooks/telegram', payload: body });

    expect(res.statusCode).toBe(401);
    expect(handle).not.toHaveBeenCalled();
  });

  test('rejects requests with a wrong secret', async () => {
    const res = await (await app()).inject({
      method: 'POST', url: '/webhooks/telegram', payload: body,
      headers: { 'x-telegram-bot-api-secret-token': 'wrong' },
    });

    expect(res.statusCode).toBe(401);
  });

  test('handles a callback and answers the Telegram query', async () => {
    const res = await (await app()).inject({
      method: 'POST', url: '/webhooks/telegram', payload: body,
      headers: { 'x-telegram-bot-api-secret-token': 's3cret_token_value' },
    });

    expect(res.statusCode).toBe(200);
    expect(answer).toHaveBeenCalledWith('q1', 'Saved', undefined);
  });

  test('ignores updates it does not understand', async () => {
    const res = await (await app()).inject({
      method: 'POST', url: '/webhooks/telegram', payload: { update_id: 2, edited_message: {} },
      headers: { 'x-telegram-bot-api-secret-token': 's3cret_token_value' },
    });

    expect(res.statusCode).toBe(200);
    expect(handle).not.toHaveBeenCalled();
  });

  test('opens the bot registration chat for users without a character', async () => {
    handle.mockResolvedValue({ text: 'Register first', register: true });

    await (await app()).inject({
      method: 'POST', url: '/webhooks/telegram', payload: body,
      headers: { 'x-telegram-bot-api-secret-token': 's3cret_token_value' },
    });

    expect(answer).toHaveBeenCalledWith('q1', 'Register first', 'https://t.me/guild_bot?start=register');
  });

  test('routes registration buttons to the registration flow and replies in private', async () => {
    regCallback.mockResolvedValue({ text: 'Pick a role' });
    const payload = { update_id: 3, callback_query: { id: 'q2', data: 'reg_class_SHAMAN', from: { id: 42 } } };

    await (await app()).inject({
      method: 'POST', url: '/webhooks/telegram', payload,
      headers: { 'x-telegram-bot-api-secret-token': 's3cret_token_value' },
    });

    expect(handle).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('42', 'Pick a role', expect.anything());
  });

  test('routes private text messages to the registration flow', async () => {
    regMessage.mockResolvedValue({ text: 'Send your name' });
    const payload = { update_id: 4, message: { chat: { id: 42, type: 'private' }, from: { id: 42 }, text: '/start register' } };

    await (await app()).inject({
      method: 'POST', url: '/webhooks/telegram', payload,
      headers: { 'x-telegram-bot-api-secret-token': 's3cret_token_value' },
    });

    expect(send).toHaveBeenCalledWith('42', 'Send your name', expect.anything());
  });

  test('ignores messages from group chats', async () => {
    const payload = { update_id: 5, message: { chat: { id: -1, type: 'supergroup' }, from: { id: 42 }, text: 'hi' } };

    await (await app()).inject({
      method: 'POST', url: '/webhooks/telegram', payload,
      headers: { 'x-telegram-bot-api-secret-token': 's3cret_token_value' },
    });

    expect(regMessage).not.toHaveBeenCalled();
  });

  test('still answers 200 when Telegram rejects our reply, so Telegram does not retry forever', async () => {
    regMessage.mockResolvedValue({ text: 'Send your name' });
    send.mockRejectedValue(new Error('403 bot was blocked by the user'));
    const payload = { update_id: 6, message: { chat: { id: 42, type: 'private' }, from: { id: 42 }, text: '/start' } };

    const res = await (await app()).inject({
      method: 'POST', url: '/webhooks/telegram', payload,
      headers: { 'x-telegram-bot-api-secret-token': 's3cret_token_value' },
    });

    expect(res.statusCode).toBe(200);
  });

  test('still answers the user when the bot username cannot be fetched', async () => {
    handle.mockResolvedValue({ text: 'Register first', register: true });
    botUsername.mockRejectedValue(new Error('network down'));

    const res = await (await app()).inject({
      method: 'POST', url: '/webhooks/telegram', payload: body,
      headers: { 'x-telegram-bot-api-secret-token': 's3cret_token_value' },
    });

    expect(res.statusCode).toBe(200);
    expect(answer).toHaveBeenCalledWith('q1', 'Register first', undefined);
  });

  test('a private message that answers the late question never reaches registration', async () => {
    lateMessage.mockResolvedValue({ text: 'Noted: late by 15 min.' });
    const payload = { update_id: 7, message: { chat: { id: 42, type: 'private' }, from: { id: 42 }, text: '15' } };

    await (await app()).inject({
      method: 'POST', url: '/webhooks/telegram', payload,
      headers: { 'x-telegram-bot-api-secret-token': 's3cret_token_value' },
    });

    expect(send).toHaveBeenCalledWith('42', 'Noted: late by 15 min.', {});
    expect(regMessage).not.toHaveBeenCalled();
  });

  test('any other private message goes to registration', async () => {
    regMessage.mockResolvedValue({ text: 'Send /start' });
    const payload = { update_id: 8, message: { chat: { id: 42, type: 'private' }, from: { id: 42 }, text: 'hello' } };

    await (await app()).inject({
      method: 'POST', url: '/webhooks/telegram', payload,
      headers: { 'x-telegram-bot-api-secret-token': 's3cret_token_value' },
    });

    expect(lateMessage).toHaveBeenCalledWith({ from: { id: 42 }, text: 'hello' });
    expect(regMessage).toHaveBeenCalled();
  });

  test('a LATE press answers the button and asks for the minutes privately', async () => {
    handle.mockResolvedValue({ text: 'Late noted.', dm: 'How many minutes late will you be?' });

    await (await app()).inject({
      method: 'POST', url: '/webhooks/telegram', payload: body,
      headers: { 'x-telegram-bot-api-secret-token': 's3cret_token_value' },
    });

    expect(answer).toHaveBeenCalledWith('q1', 'Late noted.', undefined);
    expect(send).toHaveBeenCalledWith('42', 'How many minutes late will you be?', {});
  });

  test('if the private follow-up cannot be delivered the webhook still answers 200', async () => {
    handle.mockResolvedValue({ text: 'Late noted.', dm: 'How many minutes?' });
    send.mockRejectedValue(new Error('403 bot was blocked'));

    const res = await (await app()).inject({
      method: 'POST', url: '/webhooks/telegram', payload: body,
      headers: { 'x-telegram-bot-api-secret-token': 's3cret_token_value' },
    });

    expect(res.statusCode).toBe(200);
  });
});
