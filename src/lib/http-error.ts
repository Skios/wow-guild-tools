import { Prisma } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from './errors.js';

const PRISMA_KNOWN: Record<string, { status: number; error: string }> = {
  P2002: { status: 409, error: 'Already exists' },
  P2025: { status: 404, error: 'Not found' },
  P2003: { status: 400, error: 'Invalid reference' },
};

/** Sends a safe error response: readable validation issues, no database internals. */
export function sendError(request: FastifyRequest, reply: FastifyReply, error: unknown, status: number) {
  if (error instanceof ZodError) {
    const issues = error.issues.map(i => ({ path: i.path.join('.'), message: i.message }));
    return reply.code(400).send({ error: 'Invalid request', issues });
  }
  if (error instanceof AppError) return reply.code(error.status).send({ error: error.message });

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    request.log.error({ err: error }, 'database error');
    const mapped = PRISMA_KNOWN[error.code] ?? { status: 400, error: 'Invalid data' };
    return reply.code(mapped.status).send({ error: mapped.error });
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    request.log.error({ err: error }, 'database unreachable');
    return reply.code(503).send({ error: 'Service unavailable' });
  }
  if (error instanceof Prisma.PrismaClientValidationError || error instanceof Prisma.PrismaClientUnknownRequestError) {
    request.log.error({ err: error }, 'database error');
    return reply.code(400).send({ error: 'Invalid data' });
  }
  if (error instanceof Error) return reply.code(status).send({ error: error.message });
  return reply.code(status).send({ error: 'Request failed' });
}
