import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CLASS_INFO, ROLE_LABEL, SPECS } from '../domain/wow.js';

export async function adminRoutes(fastify: FastifyInstance) {
  // Who is signed in: lets the admin site greet the officer (and tells it the login is accepted).
  fastify.get('/auth/me', { config: { duringPasswordChange: true } }, async (request) => request.officer);

  // Single source of truth for class colours, labels and valid roles.
  fastify.get('/meta/wow', async () => ({
    classes: (Object.keys(CLASS_INFO) as (keyof typeof CLASS_INFO)[]).map(id => ({
      id,
      ...CLASS_INFO[id],
      roles: [...CLASS_INFO[id].roles],
      specs: SPECS[id],
    })),
    roles: Object.entries(ROLE_LABEL).map(([id, label]) => ({ id, label })),
  }));
}
