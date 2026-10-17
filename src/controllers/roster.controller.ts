import type { FastifyInstance } from 'fastify';
import { sendError } from '../lib/http-error.js';
import { RosterService } from '../services/roster.service.js';
import { RosterEntrySchema, RosterIdParamsSchema } from '../validators/roster.validator.js';

export async function rosterRoutes(fastify: FastifyInstance) {
  const roster = new RosterService();

  fastify.get('/roster', async (request, reply) => {
    try {
      return await roster.list();
    } catch (error) {
      return sendError(request, reply, error, 400);
    }
  });

  fastify.post('/roster', async (request, reply) => {
    try {
      const { created, character } = await roster.add(RosterEntrySchema.parse(request.body));
      return reply.code(created ? 201 : 200).send(character);
    } catch (error) {
      return sendError(request, reply, error, 400);
    }
  });

  fastify.put('/roster/:id', async (request, reply) => {
    try {
      const { id } = RosterIdParamsSchema.parse(request.params);
      return reply.send(await roster.update(id, RosterEntrySchema.parse(request.body)));
    } catch (error) {
      return sendError(request, reply, error, 400);
    }
  });

  fastify.delete('/roster/:id', async (request, reply) => {
    try {
      const { id } = RosterIdParamsSchema.parse(request.params);
      await roster.remove(id);
      return reply.send({ success: true });
    } catch (error) {
      return sendError(request, reply, error, 400);
    }
  });

  fastify.post('/roster/:id/release', async (request, reply) => {
    try {
      const { id } = RosterIdParamsSchema.parse(request.params);
      return reply.send(await roster.release(id));
    } catch (error) {
      return sendError(request, reply, error, 400);
    }
  });
}
