import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { sendError } from '../lib/http-error.js';
import { verifyLinkToken } from '../domain/link-token.js';
import { linkConfig } from '../services/link.service.js';
import type { OfficerService } from '../services/officer.service.js';
import { EXPIRED_BOT_LINK } from './link.controller.js';

// Per IP. ponytail: in-memory, so per serverless instance; Supabase-side limits don't apply to the admin API.
const SIGNUPS_PER_HOUR = 10;
// Nickname and password rules live in OfficerService.signup; this only checks the shape.
const SignupSchema = z.object({ username: z.string().max(64), password: z.string().max(256), link: z.string().max(64).optional() });

type Accounts = Pick<OfficerService, 'signup' | 'resetWithLink'>;

const ResetSchema = z.object({ token: z.string().max(64), password: z.string().max(256) });
const RESETS_PER_HOUR = 10;
const EXPIRED_RESET = 'This reset link has expired: ask for a new one (send /reset to the bot).';

/** Open sign-up and the bot's password-reset links (no login). `accounts` is null without the Supabase secret key. */
export function signupRoutes(accounts: Accounts | null) {
  return async (fastify: FastifyInstance) => {
    fastify.post('/signup', { config: { rateLimit: { max: SIGNUPS_PER_HOUR, timeWindow: '1 hour' } } }, async (request, reply) => {
      try {
        if (!accounts) throw new AppError('Sign-up is not available right now', 503);
        const { username, password, link } = SignupSchema.parse(request.body);
        // Opened from the bot's link: check it before creating anything.
        let telegramId: string | undefined;
        if (link) {
          const { key } = linkConfig();
          const target = key ? verifyLinkToken(link, key) : null;
          if (target?.kind !== 'telegram') throw new AppError(EXPIRED_BOT_LINK, 400);
          telegramId = target.id;
        }
        return reply.code(201).send(await accounts.signup(username, password, telegramId));
      } catch (error) {
        return sendError(request, reply, error);
      }
    });

    // Valid 15 minutes, only ever sent to the account's own Telegram, spent once the password changes.
    fastify.post('/auth/reset', { config: { rateLimit: { max: RESETS_PER_HOUR, timeWindow: '1 hour' } } }, async (request, reply) => {
      try {
        const { token, password } = ResetSchema.parse(request.body);
        const { key } = linkConfig();
        const target = key ? verifyLinkToken(token, key) : null;
        if (target?.kind !== 'reset') throw new AppError(EXPIRED_RESET, 400);
        if (!accounts) throw new AppError('Password reset is not available right now', 503);
        await accounts.resetWithLink(target.id, password, new Date(target.issuedAt));
        request.log.info({ userId: target.id }, 'password reset with a link');
        return reply.code(204).send();
      } catch (error) {
        return sendError(request, reply, error);
      }
    });
  };
}
