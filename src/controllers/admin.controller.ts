import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { CLASS_INFO, ROLE_LABEL } from '../domain/wow.js';
import { sendError } from '../lib/http-error.js';

const MAX_CHARACTERS = 200;
const SearchQuerySchema = z.object({ search: z.string().trim().max(50).optional() });

export async function adminRoutes(fastify: FastifyInstance) {
  // Lets the admin site check a pasted API key before using it.
  fastify.get('/auth/check', async () => ({ ok: true }));

  // Single source of truth for class colours, labels and valid roles.
  fastify.get('/meta/wow', async () => ({
    classes: Object.entries(CLASS_INFO).map(([id, info]) => ({ id, ...info, roles: [...info.roles] })),
    roles: Object.entries(ROLE_LABEL).map(([id, label]) => ({ id, label })),
  }));

  // Candidates the officers can put on a roster.
  fastify.get('/characters', async (request, reply) => {
    try {
      const { search } = SearchQuerySchema.parse(request.query);
      const characters = await prisma.character.findMany({
        where: search ? { name: { contains: search, mode: 'insensitive' } } : {},
        include: { user: { select: { username: true } } },
        orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
        take: MAX_CHARACTERS,
      });
      return characters.map(({ user, ...character }) => ({ ...character, username: user.username }));
    } catch (error) {
      return sendError(request, reply, error, 400);
    }
  });
}
