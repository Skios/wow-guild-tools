import { FastifyInstance } from 'fastify';
import { EventService } from '../services/event.service';
import { CreateEventSchema, EventIdSchema, FinalizeRosterSchema } from '../validators/event.validator';
import { ResponseStatus } from '@prisma/client';

export async function eventRoutes(fastify: FastifyInstance) {
  const eventService = new EventService();

  fastify.post('/events', async (request, reply) => {
    const body = CreateEventSchema.parse(request.body);
    try {
      const event = await eventService.createEvent(body);
      return reply.code(201).send(event);
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

  fastify.patch('/events/:id/roster', async (request, reply) => {
    try {
      const id = EventIdSchema.parse(request.params.id);
      const body = FinalizeRosterSchema.parse(request.body);
      await eventService.finalizeRoster(id, body.selections);
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

  fastify.post('/events/:id/publish', async (request, reply) => {
    try {
      const id = EventIdSchema.parse(request.params.id);
      await eventService.publishEvent(id);
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

  fastify.get('/events/:id', async (request, reply) => {
    try {
      const id = EventIdSchema.parse(request.params.id);
      const event = await eventService.getEvent(id);
      return event;
    } catch (error: any) {
      return reply.code(404).send({ error: error.message });
    }
  });

  fastify.get('/events', async (request, reply) => {
    const limit = parseInt(request.query.limit as string) || 20;
    const offset = parseInt(request.query.offset as string) || 0;
    return eventService.listEvents(limit, offset);
  });
}
