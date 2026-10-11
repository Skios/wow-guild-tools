import { FastifyInstance } from 'fastify';
import { EventService } from '../services/event.service';
import { CreateEventSchema } from '../validators/event.validator';
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
    const { id } = request.params as { id: string };
    const { selections } = request.body as { selections: { characterId: string, status: ResponseStatus, isConfirmed: boolean }[] };
    try {
      await eventService.finalizeRoster(id, selections);
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

  fastify.post('/events/:id/publish', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await eventService.publishEvent(id);
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

  fastify.get('/events/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const event = await eventService.getEvent(id);
      return event;
    } catch (error: any) {
      return reply.code(404).send({ error: error.message });
    }
  });

  fastify.get('/events', async () => {
    return eventService.listEvents();
  });
}
