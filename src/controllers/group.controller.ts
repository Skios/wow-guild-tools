import type { FastifyInstance } from 'fastify';
import { sendError } from '../lib/http-error.js';
import { GroupService } from '../services/group.service.js';
import { z } from 'zod';

const GroupSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export async function groupRoutes(fastify: FastifyInstance) {
  const groupService = new GroupService();

  fastify.post('/groups', async (request, reply) => {
    try {
      const body = GroupSchema.parse(request.body);
      const group = await groupService.createGroup(body.name, body.description);
      return reply.code(201).send(group);
    } catch (error) {
      return sendError(request, reply, error, 400);
    }
  });

  fastify.get('/groups', async () => {
    return groupService.listGroups();
  });

  fastify.get('/groups/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const group = await groupService.getGroup(id);
      return reply.send(group);
    } catch (error) {
      return sendError(request, reply, error, 404);
    }
  });

  fastify.post('/groups/:id/members', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.body as { userId: string };
    try {
      await groupService.addMember(userId, id);
      return reply.send({ success: true });
    } catch (error) {
      return sendError(request, reply, error, 400);
    }
  });

  fastify.delete('/groups/:id/members/:userId', async (request, reply) => {
    const { id, userId } = request.params as { id: string, userId: string };
    try {
      await groupService.removeMember(userId, id);
      return reply.send({ success: true });
    } catch (error) {
      return sendError(request, reply, error, 400);
    }
  });

  fastify.delete('/groups/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await groupService.deleteGroup(id);
      return reply.send({ success: true });
    } catch (error) {
      return sendError(request, reply, error, 400);
    }
  });
}
