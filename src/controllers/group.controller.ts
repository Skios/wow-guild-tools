import type { FastifyInstance } from 'fastify';
import { sendError } from '../lib/http-error.js';
import { GroupService } from '../services/group.service.js';
import { GroupIdParamsSchema, GroupSchema, MemberBodySchema, MemberParamsSchema } from '../validators/group.validator.js';

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

  fastify.get('/groups', async () => groupService.listGroups());

  fastify.get('/groups/:id', async (request, reply) => {
    try {
      const { id } = GroupIdParamsSchema.parse(request.params);
      return reply.send(await groupService.getGroup(id));
    } catch (error) {
      return sendError(request, reply, error, 404);
    }
  });

  fastify.post('/groups/:id/members', async (request, reply) => {
    try {
      const { id } = GroupIdParamsSchema.parse(request.params);
      const { userId } = MemberBodySchema.parse(request.body);
      await groupService.addMember(userId, id);
      return reply.send({ success: true });
    } catch (error) {
      return sendError(request, reply, error, 400);
    }
  });

  fastify.delete('/groups/:id/members/:userId', async (request, reply) => {
    try {
      const { id, userId } = MemberParamsSchema.parse(request.params);
      await groupService.removeMember(userId, id);
      return reply.send({ success: true });
    } catch (error) {
      return sendError(request, reply, error, 400);
    }
  });

  fastify.delete('/groups/:id', async (request, reply) => {
    try {
      const { id } = GroupIdParamsSchema.parse(request.params);
      await groupService.deleteGroup(id);
      return reply.send({ success: true });
    } catch (error) {
      return sendError(request, reply, error, 400);
    }
  });
}
