import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { sendError } from '../lib/http-error.js';
import { requireCapability } from '../plugins/auth.js';
import type { OfficerService } from '../services/officer.service.js';

const IdParamsSchema = z.object({ id: z.uuid() });
const PasswordSchema = z.object({ currentPassword: z.string().min(1).max(256), password: z.string().max(256) });
// Per IP: each try checks the current password against Supabase.
const PASSWORD_CHANGES_PER_15_MIN = 5;

export type AccountAdmin = Pick<OfficerService, 'listAccounts' | 'resetPasswordFor' | 'changeOwnPassword'>;

/** The Users page and changing your own password. `accounts` is null when the API has no Supabase secret key. */
export function accountRoutes(accounts: AccountAdmin | null) {
  const need = () => {
    if (!accounts) throw new AppError('Account management is not available right now', 503);
    return accounts;
  };

  return async (fastify: FastifyInstance) => {
    const manage = { onRequest: requireCapability('accounts.manage') };

    fastify.get('/users', manage, async (request, reply) => {
      try {
        return await need().listAccounts();
      } catch (error) {
        return sendError(request, reply, error);
      }
    });

    fastify.post('/users/:id/password-reset', manage, async (request, reply) => {
      try {
        const { id } = IdParamsSchema.parse(request.params);
        return { password: await need().resetPasswordFor(request.officer!, id) };
      } catch (error) {
        return sendError(request, reply, error);
      }
    });

    // Also reachable with a temporary password: that is how the lock is lifted.
    fastify.post('/auth/password', {
      config: { duringPasswordChange: true, rateLimit: { max: PASSWORD_CHANGES_PER_15_MIN, timeWindow: '15 minutes' } },
    }, async (request, reply) => {
      try {
        const { currentPassword, password } = PasswordSchema.parse(request.body);
        const { userId, username } = request.officer!;
        await need().changeOwnPassword(userId, username, currentPassword, password);
        return reply.code(204).send();
      } catch (error) {
        return sendError(request, reply, error);
      }
    });
  };
}
