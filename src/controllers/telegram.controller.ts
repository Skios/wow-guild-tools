import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { telegramConfig } from '../config/telegram.js';
import { TelegramClient } from '../integrations/telegram/telegram.client.js';
import { safeEqual } from '../lib/safe-equal.js';
import { handleRegistrationCallback, handleRegistrationMessage, type Reply } from '../services/registration.service.js';
import { CallbackQuerySchema, handleCallbackQuery } from '../services/telegram-callback.service.js';

const SenderSchema = z.object({
  id: z.number(),
  username: z.string().optional(),
  first_name: z.string().optional(),
});

const UpdateSchema = z.object({
  callback_query: CallbackQuerySchema.optional(),
  message: z.object({
    chat: z.object({ id: z.number(), type: z.string() }),
    from: SenderSchema,
    text: z.string().optional(),
  }).optional(),
});

export async function telegramRoutes(fastify: FastifyInstance) {
  const client = new TelegramClient();

  // Registration happens in the private chat with the bot, which also lets the bot DM the user later.
  fastify.post('/webhooks/telegram', async (request, response) => {
    // Telegram retries on non-2xx, so a failed send (e.g. user blocked the bot) is logged, not thrown.
    const reply = (chatId: number, { text, keyboard }: Reply) =>
      client.sendMessage(String(chatId), text, keyboard ? { reply_markup: keyboard } : {})
        .catch(err => request.log.warn({ err }, 'sendMessage failed'));

    if (!safeEqual(request.headers['x-telegram-bot-api-secret-token'], telegramConfig.webhookSecret)) {
      return response.code(401).send({ error: 'Unauthorized' });
    }

    const update = UpdateSchema.safeParse(request.body);
    if (!update.success) return response.send({ ok: true });
    const { callback_query: query, message } = update.data;

    if (message?.text && message.chat.type === 'private') {
      await reply(message.chat.id, await handleRegistrationMessage({ from: message.from, text: message.text }));
    } else if (query?.data.startsWith('reg_')) {
      await reply(query.from.id, await handleRegistrationCallback(query));
      await client.answerCallback(query.id, '').catch(err => request.log.warn({ err }, 'answerCallbackQuery failed'));
    } else if (query) {
      const result = await handleCallbackQuery(query);
      const url = result.register ? `https://t.me/${await client.getBotUsername()}?start=register` : undefined;
      await client.answerCallback(query.id, result.text, url).catch(err => request.log.warn({ err }, 'answerCallbackQuery failed'));
    }
    return response.send({ ok: true });
  });
}
