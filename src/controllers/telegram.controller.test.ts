import Fastify from 'fastify';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const handle = vi.hoisted(() => vi.fn());
const answer = vi.hoisted(() => vi.fn());
vi.mock('../services/telegram-callback.service.js', async (orig) => ({
  ...(await orig<object>()),
  handleCallbackQuery: handle,
}));
vi.mock('../integrations/telegram/telegram.client.js', () => ({
  TelegramClient: class { answerCallback = answer; },
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
    handle.mockResolvedValue('Saved');
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
    expect(answer).toHaveBeenCalledWith('q1', 'Saved');
  });

  test('ignores updates that are not callback queries', async () => {
    const res = await (await app()).inject({
      method: 'POST', url: '/webhooks/telegram', payload: { update_id: 2, message: {} },
      headers: { 'x-telegram-bot-api-secret-token': 's3cret_token_value' },
    });

    expect(res.statusCode).toBe(200);
    expect(handle).not.toHaveBeenCalled();
  });
});
