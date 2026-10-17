import { Prisma } from '@prisma/client';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { sendError } from './http-error.js';

function fakeReply() {
  const reply = { code: vi.fn(), send: vi.fn() };
  reply.code.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply;
}
const request = { log: { error: vi.fn() } };

describe('sendError', () => {
  test('turns a zod error into 400 with readable issues, not raw JSON', () => {
    const reply = fakeReply();
    const error = z.object({ limit: z.number().max(100) }).safeParse({ limit: 500 }).error!;

    sendError(request as never, reply as never, error, 404);

    expect(reply.code).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({
      error: 'Invalid request',
      issues: [{ path: 'limit', message: expect.any(String) }],
    });
  });

  test('hides database error details and logs them', () => {
    const reply = fakeReply();
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed on users_email', {
      code: 'P2002',
      clientVersion: '5',
    });

    sendError(request as never, reply as never, error, 400);

    expect(reply.send).toHaveBeenCalledWith({ error: 'Invalid data' });
    expect(request.log.error).toHaveBeenCalled();
  });

  test('keeps our own business messages with the status the route chose', () => {
    const reply = fakeReply();

    sendError(request as never, reply as never, new Error('Event not found'), 404);

    expect(reply.code).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Event not found' });
  });

  test('does not leak non-Error throwables', () => {
    const reply = fakeReply();

    sendError(request as never, reply as never, 'secret string', 400);

    expect(reply.send).toHaveBeenCalledWith({ error: 'Request failed' });
  });
});
