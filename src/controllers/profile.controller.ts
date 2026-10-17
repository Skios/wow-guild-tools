import type { FastifyInstance } from 'fastify';
import { sendError } from '../lib/http-error.js';
import { ProfileService } from '../services/profile.service.js';
import { z } from 'zod';
import { WoWClass, WoWRole } from '@prisma/client';

const CharacterSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1),
  realm: z.string().min(1),
  class: z.nativeEnum(WoWClass),
  role: z.nativeEnum(WoWRole),
});

export async function profileRoutes(fastify: FastifyInstance) {
  const profileService = new ProfileService();

  fastify.post('/profiles/characters', async (request, reply) => {
    try {
      const body = CharacterSchema.parse(request.body);
      const character = await profileService.addCharacter(body);
      return reply.code(201).send(character);
    } catch (error) {
      return sendError(request, reply, error, 400);
    }
  });

  fastify.put('/profiles/main-character/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.body as { userId: string };
    try {
      const main = await profileService.setMainCharacter(userId, id);
      return reply.send(main);
    } catch (error) {
      return sendError(request, reply, error, 400);
    }
  });

  fastify.get('/profiles/me/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const profile = await profileService.getMyProfile(id);
      return reply.send(profile);
    } catch (error) {
      return sendError(request, reply, error, 404);
    }
  });
}
