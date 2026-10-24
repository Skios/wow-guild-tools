import type { FastifyInstance } from 'fastify';
import { sendError } from '../lib/http-error.js';
import { requireCapability } from '../plugins/auth.js';
import { EventService } from '../services/event.service.js';
import { SetDefaultRoleTargetSchema, SetRoleTargetSchema } from '../validators/role-target.validator.js';
import { CreateEventSchema, EventParamsSchema, FinalizeRosterSchema, ListEventsQuerySchema, MessageSchema, SetRemindersSchema, SwitchCharacterParamsSchema, SwitchCharacterSchema } from '../validators/event.validator.js';

export async function eventRoutes(fastify: FastifyInstance) {
  const eventService = new EventService();

  fastify.post('/events', async (request, reply) => {
    try {
      const body = CreateEventSchema.parse(request.body);
      const event = await eventService.createEvent({ ...body, createdByUserId: request.officer!.userId });
      return reply.code(201).send(event);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  fastify.patch('/events/:id/roster', async (request, reply) => {
    try {
      const id = EventParamsSchema.parse(request.params).id;
      const body = FinalizeRosterSchema.parse(request.body);
      await eventService.finalizeRoster(id, body.selections);
      return reply.send({ success: true });
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  fastify.post('/events/:id/publish', async (request, reply) => {
    try {
      const id = EventParamsSchema.parse(request.params).id;
      await eventService.publishEvent(id);
      return reply.send({ success: true });
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  // Writing to players is a capability of its own, separate from managing events.
  fastify.post('/events/:id/message', { onRequest: requireCapability('messages.send') }, async (request, reply) => {
    try {
      const { id } = EventParamsSchema.parse(request.params);
      const body = MessageSchema.parse(request.body);
      return reply.send({ results: await eventService.messageCharacters(id, body.characterIds, body.text, request.officer!.userId) });
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  fastify.post('/events/:id/responses/:characterId/switch', async (request, reply) => {
    try {
      const { id, characterId } = SwitchCharacterParamsSchema.parse(request.params);
      const { to } = SwitchCharacterSchema.parse(request.body);
      if (to === characterId) return reply.code(400).send({ error: 'Already answering with that character' });
      await eventService.switchCharacter(id, characterId, to);
      return reply.send({ success: true });
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  fastify.post('/events/:id/cancel', async (request, reply) => {
    try {
      const { id } = EventParamsSchema.parse(request.params);
      return reply.send(await eventService.cancelEvent(id));
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  fastify.post('/events/:id/reopen', async (request, reply) => {
    try {
      const { id } = EventParamsSchema.parse(request.params);
      return reply.send(await eventService.reopenEvent(id));
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  fastify.put('/events/:id/role-target', async (request, reply) => {
    try {
      const { id } = EventParamsSchema.parse(request.params);
      const { target } = SetRoleTargetSchema.parse(request.body);
      await eventService.setEventRoleTarget(id, target);
      return reply.send({ success: true });
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  fastify.put('/role-target/default', async (request, reply) => {
    try {
      const { target } = SetDefaultRoleTargetSchema.parse(request.body);
      await eventService.setDefaultRoleTarget(target);
      return reply.send({ success: true });
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  fastify.put('/events/:id/reminders', async (request, reply) => {
    try {
      const { id } = EventParamsSchema.parse(request.params);
      const { minutesBefore } = SetRemindersSchema.parse(request.body);
      return reply.send(await eventService.setReminders(id, minutesBefore));
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  fastify.get('/events/:id', async (request, reply) => {
    try {
      const id = EventParamsSchema.parse(request.params).id;
      const event = await eventService.getEventDetail(id);
      return event;
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  fastify.get('/events', async (request, reply) => {
    try {
      const { limit, offset } = ListEventsQuerySchema.parse(request.query);
      return await eventService.listEvents(limit, offset);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });
}
