import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sendError } from '../lib/http-error.js';
import { ProfileService } from '../services/profile.service.js';
import { CharacterSchema, SetMainSchema } from '../validators/character.validator.js';

const IdParamsSchema = z.object({ id: z.string().uuid('Invalid ID') });

export async function profileRoutes(fastify: FastifyInstance) {
  const profileService = new ProfileService();

  fastify.post('/profiles/characters', async (request, reply) => {
    try {
      const body = CharacterSchema.parse(request.body);
      return reply.code(201).send(await profileService.addCharacter(body));
    } catch (error) {
      return sendError(request, reply, error, 400);
    }
  });

  fastify.put('/profiles/main-character/:id', async (request, reply) => {
    try {
      const { id } = IdParamsSchema.parse(request.params);
      const { userId } = SetMainSchema.parse(request.body);
      return reply.send(await profileService.setMainCharacter(userId, id));
    } catch (error) {
      return sendError(request, reply, error, 400);
    }
  });

  fastify.get('/profiles/me/:id', async (request, reply) => {
    try {
      const { id } = IdParamsSchema.parse(request.params);
      return reply.send(await profileService.getMyProfile(id));
    } catch (error) {
      return sendError(request, reply, error, 404);
    }
  });
}
