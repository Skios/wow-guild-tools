import { Prisma } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

/** Sends a safe error response: readable validation issues, no database internals. */
export function sendError(request: FastifyRequest, reply: FastifyReply, error: unknown, status: number) {
  if (error instanceof ZodError) {
    const issues = error.issues.map(i => ({ path: i.path.join('.'), message: i.message }));
    return reply.code(400).send({ error: 'Invalid request', issues });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    request.log.error({ err: error }, 'database error');
    return reply.code(400).send({ error: 'Invalid data' });
  }
  if (error instanceof Error) return reply.code(status).send({ error: error.message });
  return reply.code(status).send({ error: 'Request failed' });
}
