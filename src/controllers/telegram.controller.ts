import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { safeEqual } from '../lib/safe-equal.js';
import { telegramConfig } from '../config/telegram.js';
import { TelegramClient } from '../integrations/telegram/telegram.client.js';
import { CallbackQuerySchema, handleCallbackQuery } from '../services/telegram-callback.service.js';

const UpdateSchema = z.object({ callback_query: CallbackQuerySchema.optional() });

export async function telegramRoutes(fastify: FastifyInstance) {
  const client = new TelegramClient();

  fastify.post('/webhooks/telegram', async (request, reply) => {
    if (!safeEqual(request.headers['x-telegram-bot-api-secret-token'], telegramConfig.webhookSecret)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const update = UpdateSchema.safeParse(request.body);
    const query = update.success ? update.data.callback_query : undefined;
    if (!query) return reply.send({ ok: true });

    const text = await handleCallbackQuery(query);
    await client.answerCallback(query.id, text).catch(err => request.log.warn({ err }, 'answerCallbackQuery failed'));
    return reply.send({ ok: true });
  });
}
