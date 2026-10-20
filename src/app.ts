import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { adminRoutes } from './controllers/admin.controller.js';
import { eventRoutes } from './controllers/event.controller.js';
import { groupRoutes } from './controllers/group.controller.js';
import { profileRoutes } from './controllers/profile.controller.js';
import { rosterRoutes } from './controllers/roster.controller.js';
import { telegramRoutes } from './controllers/telegram.controller.js';
import { getEnv } from './config/env.js';
import { sendError } from './lib/http-error.js';
import { requireApiKey } from './plugins/auth.js';

const BODY_LIMIT_BYTES = 100 * 1024;
const RATE_LIMIT_PER_MINUTE = 300;

export async function buildApp(options: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: BODY_LIMIT_BYTES,
    // Behind a hosting proxy the client IP is in X-Forwarded-For; without this every client shares one rate limit.
    trustProxy: getEnv().TRUST_PROXY ?? false,
  });

  // Fastify's own 4xx (bad JSON, body too large, rate limit) carry safe messages; anything else is hidden.
  app.setErrorHandler((error, request, reply) => {
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return reply.code(status).send({ error: (error as Error).message });
    return sendError(request, reply, error);
  });

  // ponytail: in-memory store, fine for one instance; move to a shared store if the API ever scales out.
  await app.register(rateLimit, { max: RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' });

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // The webhook has its own secret. Officer routes need the API key, when one is configured.
  await app.register(telegramRoutes);
  await app.register(async (officer) => {
    if (getEnv().API_KEY) requireApiKey(officer);
    await officer.register(adminRoutes);
    await officer.register(eventRoutes);
    await officer.register(profileRoutes);
    await officer.register(groupRoutes);
    await officer.register(rosterRoutes);
  });

  return app;
}
