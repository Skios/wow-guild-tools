import type { FastifyInstance } from 'fastify';
import { sendError } from '../lib/http-error.js';
import { safeEqual } from '../lib/safe-equal.js';
import { EventService } from '../services/event.service.js';

/** Called by pg_cron (through pg_net) when a reminder is due; the shared secret is the only way in. */
export const reminderRoutes = (secret: string | undefined) => async (fastify: FastifyInstance) => {
  const eventService = new EventService();

  // Not in the shared rate limit: strangers filling it must not delay reminders; the secret gates the route.
  fastify.post('/reminders/run', {
    config: { rateLimit: false },
    onRequest: async (request, reply) => {
      if (!secret) return reply.code(503).send({ error: 'Reminders are not configured' });
      if (!safeEqual(request.headers['x-cron-secret'], secret)) return reply.code(401).send({ error: 'Unauthorized' });
    },
  }, async (request, reply) => {
    try {
      const result = await eventService.sendDueReminders();
      request.log.info(result, 'reminders sent');
      return reply.send(result);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });
};
