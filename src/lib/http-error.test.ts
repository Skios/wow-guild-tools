import { Prisma } from '@prisma/client';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { AppError, ConflictError, NotFoundError } from './errors.js';
import { sendError } from './http-error.js';

function fakeReply() {
  const reply = { code: vi.fn(), send: vi.fn() };
  reply.code.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply;
}
const request = { log: { error: vi.fn() } };
const run = (error: unknown) => {
  const reply = fakeReply();
  sendError(request as never, reply as never, error);
  return { code: reply.code.mock.calls[0]![0], body: reply.send.mock.calls[0]![0] };
};
const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed on users_email', { code, clientVersion: '5' });

describe('sendError', () => {
  test('turns a zod error into 400 with readable issues, not raw JSON', () => {
    const error = z.object({ limit: z.number().max(100) }).safeParse({ limit: 500 }).error!;

    const { code, body } = run(error);

    expect(code).toBe(400);
    expect(body).toEqual({ error: 'Invalid request', issues: [{ path: 'limit', message: expect.any(String) }] });
  });

  test.each([
    ['P2002', 409, 'Already exists'],
    ['P2025', 404, 'Not found'],
    ['P2003', 400, 'Invalid reference'],
    ['P2000', 400, 'Invalid data'],
    ['P9999', 400, 'Invalid data'],
  ])('maps Prisma %s to %i without leaking details', (prismaCode, status, message) => {
    const { code, body } = run(known(prismaCode));

    expect(code).toBe(status);
    expect(body).toEqual({ error: message });
    expect(JSON.stringify(body)).not.toMatch(/users_email|constraint/i);
  });

  test('hides Prisma validation errors, which embed the query', () => {
    const error = new Prisma.PrismaClientValidationError('Argument `where` is missing at prisma.user.findUnique()', {
      clientVersion: '5',
    });

    const { code, body } = run(error);

    expect(code).toBe(400);
    expect(body).toEqual({ error: 'Invalid data' });
  });

  test('reports an unreachable database as 503', () => {
    const error = new Prisma.PrismaClientInitializationError("Can't reach database server at db.internal:5432", '5');

    const { code, body } = run(error);

    expect(code).toBe(503);
    expect(body).toEqual({ error: 'Service unavailable' });
  });

  test('logs every database error', () => {
    request.log.error.mockClear();
    run(known('P2002'));
    expect(request.log.error).toHaveBeenCalledTimes(1);
  });

  test('uses the status carried by our own errors', () => {
    expect(run(new NotFoundError('Event not found'))).toEqual({ code: 404, body: { error: 'Event not found' } });
    expect(run(new ConflictError('Locked'))).toEqual({ code: 409, body: { error: 'Locked' } });
    expect(run(new AppError('Teapot', 418))).toEqual({ code: 418, body: { error: 'Teapot' } });
  });

  test('hides unexpected errors behind a logged 500', () => {
    request.log.error.mockClear();

    expect(run(new Error('connect ECONNREFUSED 10.0.0.3:5432'))).toEqual({ code: 500, body: { error: 'Internal error' } });
    expect(request.log.error).toHaveBeenCalledTimes(1);
  });

  test.each(['secret string', 42, null, undefined, { message: 'leak' }])(
    'does not leak non-Error throwable %j',
    (thrown) => {
      expect(run(thrown)).toEqual({ code: 500, body: { error: 'Internal error' } });
    },
  );
});
