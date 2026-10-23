import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { signLinkToken, verifyLinkToken } from '../domain/link-token.js';
import { AppError } from '../lib/errors.js';
import { sendError } from '../lib/http-error.js';
import { ConflictError } from '../lib/errors.js';
import { linkTelegram, resetLink, resetMessage, unlinkTelegram, type LinkConfig } from '../services/link.service.js';

const TokenSchema = z.object({ token: z.string().max(64) });
export const EXPIRED_BOT_LINK = 'This Telegram link has expired: send /start to the bot again.';

/** Your account's Telegram link (any signed-in account). */
export function linkRoutes(deps: {
  config: () => LinkConfig; botUsername: () => Promise<string | undefined>; sendTelegram: (chatId: string, text: string) => Promise<unknown>;
}) {
  return async (fastify: FastifyInstance) => {
    fastify.get('/me/telegram', async (request, reply) => {
      try {
        const linked = await prisma.identity.findFirst({ where: { userId: request.officer!.userId, platform: 'telegram' }, select: { id: true } });
        return { linked: Boolean(linked) };
      } catch (error) {
        return sendError(request, reply, error);
      }
    });

    // Made on the "Link Telegram" click (valid 5 minutes): opening it in Telegram links that Telegram here.
    fastify.post('/me/telegram/bot-link', async (request, reply) => {
      try {
        const { key } = deps.config();
        const bot = key ? await deps.botUsername().catch(() => undefined) : undefined;
        if (!key || !bot) throw new AppError('Linking is not available right now', 503);
        return { url: `https://t.me/${bot}?start=l${signLinkToken({ kind: 'account', id: request.officer!.userId }, key)}` };
      } catch (error) {
        return sendError(request, reply, error);
      }
    });

    // The bot sends a password-reset link to my Telegram (the preferred channel; the only one so far).
    fastify.post('/me/password-reset-link', async (request, reply) => {
      try {
        const userId = request.officer!.userId;
        const telegram = await prisma.identity.findFirst({ where: { userId, platform: 'telegram' }, select: { platformUserId: true } });
        if (!telegram) throw new ConflictError('Link Telegram first: the reset link is sent there.');
        const link = resetLink(userId, deps.config());
        if (!link) throw new AppError('Password reset links are not available right now', 503);
        await deps.sendTelegram(telegram.platformUserId, resetMessage(link));
        return reply.code(204).send();
      } catch (error) {
        return sendError(request, reply, error);
      }
    });

    fastify.delete('/me/telegram', async (request, reply) => {
      try {
        await unlinkTelegram(request.officer!.userId);
        request.log.info({ userId: request.officer!.userId }, 'telegram unlinked');
        return reply.code(204).send();
      } catch (error) {
        return sendError(request, reply, error);
      }
    });

    // The bot's link (/link?t=...), confirmed by the signed-in user on their account page.
    fastify.post('/me/telegram', async (request, reply) => {
      try {
        const { key } = deps.config();
        if (!key) throw new AppError('Linking is not available right now', 503);
        const target = verifyLinkToken(TokenSchema.parse(request.body).token, key);
        if (target?.kind !== 'telegram') throw new AppError(EXPIRED_BOT_LINK, 400);
        await linkTelegram(request.officer!.userId, target.id);
        request.log.info({ userId: request.officer!.userId, telegramId: target.id }, 'telegram linked');
        return reply.code(204).send();
      } catch (error) {
        return sendError(request, reply, error);
      }
    });
  };
}
