import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sendError } from '../lib/http-error.js';
import { searchCharacters } from '../services/character-search.service.js';
import { MeService } from '../services/me.service.js';

const IdParamsSchema = z.object({ id: z.uuid() });
const NicknameBody = z.object({ nickname: z.string().max(64).nullable() });
const SEARCHES_PER_MINUTE = 30;
const SearchQuery = z.object({ q: z.string().trim().min(2).max(24) });

// The signed-in player's profile (any account): the user id always comes from the login, never from the request.
export async function meRoutes(fastify: FastifyInstance) {
  const me = new MeService();
  const handle = (run: (userId: string, request: FastifyRequest) => Promise<unknown>, status = 200) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await run(request.officer!.userId, request);
        return status === 204 ? reply.code(204).send() : reply.code(status).send(result);
      } catch (error) {
        return sendError(request, reply, error);
      }
    };
  const id = (request: { params: unknown }) => IdParamsSchema.parse(request.params).id;

  fastify.get('/me/profile', handle(userId => me.profile(userId)));
  fastify.put('/me/profile', handle((userId, request) => me.setNickname(userId, NicknameBody.parse(request.body).nickname), 204));
  fastify.get('/me/claimable', handle(() => me.claimable()));
  fastify.post('/me/characters', handle((userId, request) => me.addCharacter(userId, request.body), 201));
  fastify.post('/me/characters/:id/claim', handle((userId, request) => me.claim(userId, id(request))));
  fastify.put('/me/characters/:id', handle((userId, request) => me.updateCharacter(userId, id(request), request.body), 204));
  fastify.put('/me/characters/:id/main', handle((userId, request) => me.setMain(userId, id(request)), 204));
  fastify.delete('/me/characters/:id', handle((userId, request) => me.removeCharacter(userId, id(request)), 204));
  // Name suggestions while typing (guild first, then Raider.IO EU).
  // Each search calls Raider.IO: keep it to typing speed.
  fastify.get('/characters/search', { config: { rateLimit: { max: SEARCHES_PER_MINUTE, timeWindow: '1 minute' } } },
    handle((_userId, request) => searchCharacters(SearchQuery.parse(request.query).q)));
}
