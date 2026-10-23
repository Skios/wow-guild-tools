import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { sendError } from '../lib/http-error.js';
import { RosterService } from '../services/roster.service.js';
import { RosterEntrySchema, RosterIdParamsSchema } from '../validators/roster.validator.js';

const OwnerSchema = z.object({ userId: z.uuid().nullable() });

export async function rosterRoutes(fastify: FastifyInstance) {
  const roster = new RosterService();

  fastify.get('/roster', async (request, reply) => {
    try {
      return await roster.list();
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  fastify.post('/roster', async (request, reply) => {
    try {
      const { created, character } = await roster.add(RosterEntrySchema.parse(request.body));
      return reply.code(created ? 201 : 200).send(character);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  fastify.put('/roster/:id', async (request, reply) => {
    try {
      const { id } = RosterIdParamsSchema.parse(request.params);
      return reply.send(await roster.update(id, RosterEntrySchema.parse(request.body)));
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  fastify.delete('/roster/:id', async (request, reply) => {
    try {
      const { id } = RosterIdParamsSchema.parse(request.params);
      await roster.remove(id);
      return reply.send({ success: true });
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  // Who a roster character can be given to: accounts that can sign in (no roles or other details).
  fastify.get('/roster/accounts', async (request, reply) => {
    try {
      return await prisma.user.findMany({
        where: { identities: { some: { platform: 'supabase' } } },
        select: { id: true, username: true, nickname: true },
        orderBy: { username: 'asc' },
      });
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  fastify.put('/roster/:id/owner', async (request, reply) => {
    try {
      const { id } = RosterIdParamsSchema.parse(request.params);
      const { userId } = OwnerSchema.parse(request.body);
      return reply.send(await roster.assign(id, userId));
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  fastify.post('/roster/:id/release', async (request, reply) => {
    try {
      const { id } = RosterIdParamsSchema.parse(request.params);
      return reply.send(await roster.release(id));
    } catch (error) {
      return sendError(request, reply, error);
    }
  });
}
