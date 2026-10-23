import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { knownCapabilities } from '../domain/roles.js';
import { sendError } from '../lib/http-error.js';
import { requireCapability, requireOwner } from '../plugins/auth.js';
import { RoleService } from '../services/role.service.js';
import { AssignRoleSchema } from '../validators/role.validator.js';

const IdParamsSchema = z.object({ id: z.uuid() });

// Configuring roles is for the Owner only; giving roles to people needs accounts.manage.
export async function roleRoutes(fastify: FastifyInstance) {
  const roles = new RoleService();
  const owner = { onRequest: requireOwner };

  fastify.get('/roles', async (request, reply) => {
    try {
      return await roles.list();
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  // Read per request, so it lists every capability the app's routes registered.
  fastify.get('/roles/capabilities', owner, async () => knownCapabilities());

  fastify.post('/roles', owner, async (request, reply) => {
    try {
      return reply.code(201).send(await roles.create(request.body));
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  fastify.put('/roles/:id', owner, async (request, reply) => {
    try {
      const { id } = IdParamsSchema.parse(request.params);
      return await roles.update(id, request.body);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  fastify.delete('/roles/:id', owner, async (request, reply) => {
    try {
      await roles.remove(IdParamsSchema.parse(request.params).id);
      return reply.code(204).send();
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  fastify.put('/users/:id/role', { onRequest: requireCapability('accounts.manage') }, async (request, reply) => {
    try {
      const { id } = IdParamsSchema.parse(request.params);
      await roles.assign(request.officer!, id, AssignRoleSchema.parse(request.body).roleId);
      return reply.code(204).send();
    } catch (error) {
      return sendError(request, reply, error);
    }
  });
}
