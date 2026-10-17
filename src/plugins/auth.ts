import type { FastifyInstance } from 'fastify';
import { getEnv } from '../config/env.js';
import { safeEqual } from '../lib/safe-equal.js';

// ponytail: single shared key, no per-officer identity. Add real users/roles when audit trail matters.
// Call directly on a scope (not via register) so the hook covers that scope's routes.
export function requireApiKey(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request, reply) => {
    if (!safeEqual(request.headers['x-api-key'], getEnv().API_KEY ?? '')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });
}
