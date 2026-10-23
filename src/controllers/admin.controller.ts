import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { CLASS_INFO, ROLE_LABEL, SPECS } from '../domain/wow.js';
import { sendError } from '../lib/http-error.js';
import { requireCapability } from '../plugins/auth.js';

const MAX_CHARACTERS = 200;
const SearchQuerySchema = z.object({ search: z.string().trim().max(50).optional() });

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

  // Candidates the officers can put on an event roster (lists every player: not for Raiders).
  fastify.get('/characters', { onRequest: requireCapability('events.manage') }, async (request, reply) => {
    try {
      const { search } = SearchQuerySchema.parse(request.query);
      const characters = await prisma.character.findMany({
        where: search ? { name: { contains: search, mode: 'insensitive' } } : {},
        include: { user: { select: { username: true } } },
        orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
        take: MAX_CHARACTERS,
      });
      return characters.map(({ user, ...character }) => ({ ...character, username: user?.username ?? null }));
    } catch (error) {
      return sendError(request, reply, error);
    }
  });
}
