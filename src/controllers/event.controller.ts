import type { FastifyInstance } from 'fastify';
import { EventService } from '../services/event.service.js';
import { CreateEventSchema, EventParamsSchema, FinalizeRosterSchema, ListEventsQuerySchema } from '../validators/event.validator.js';

export async function eventRoutes(fastify: FastifyInstance) {
  const eventService = new EventService();

  fastify.post('/events', async (request, reply) => {
    try {
      const body = CreateEventSchema.parse(request.body);
      const event = await eventService.createEvent(body);
      return reply.code(201).send(event);
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

  fastify.patch('/events/:id/roster', async (request, reply) => {
    try {
      const id = EventParamsSchema.parse(request.params).id;
      const body = FinalizeRosterSchema.parse(request.body);
      await eventService.finalizeRoster(id, body.selections);
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

  fastify.post('/events/:id/publish', async (request, reply) => {
    try {
      const id = EventParamsSchema.parse(request.params).id;
      await eventService.publishEvent(id);
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

  fastify.get('/events/:id', async (request, reply) => {
    try {
      const id = EventParamsSchema.parse(request.params).id;
      const event = await eventService.getEvent(id);
      return event;
    } catch (error: any) {
      return reply.code(404).send({ error: error.message });
    }
  });

  fastify.get('/events', async (request, reply) => {
    try {
      const { limit, offset } = ListEventsQuerySchema.parse(request.query);
      return await eventService.listEvents(limit, offset);
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });
}
