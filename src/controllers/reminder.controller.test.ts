import Fastify from 'fastify';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const run = vi.hoisted(() => vi.fn());
vi.mock('../services/event.service.js', () => ({ EventService: class { sendDueReminders = run; } }));

import { reminderRoutes } from './reminder.controller.js';

const SECRET = 'a'.repeat(32);
const app = async (secret: string | undefined) => {
  const fastify = Fastify();
  await fastify.register(reminderRoutes(secret));
  return fastify;
};
const call = async (headers: Record<string, string>, secret: string | undefined = SECRET) =>
  (await app(secret)).inject({ method: 'POST', url: '/reminders/run', headers });

beforeEach(() => {
  run.mockReset();
  run.mockResolvedValue({ reminders: 1, messages: 3 });
});

describe('POST /reminders/run (called by pg_cron)', () => {
  test('with the shared secret it sends the due reminders', async () => {
    const res = await call({ 'x-cron-secret': SECRET });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ reminders: 1, messages: 3 });
  });

  test('a wrong or missing secret is refused before anything runs', async () => {
    expect((await call({ 'x-cron-secret': 'b'.repeat(32) })).statusCode).toBe(401);
    expect((await call({})).statusCode).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  test('not configured: 503, never open', async () => {
    const res = await (await app(undefined)).inject({ method: 'POST', url: '/reminders/run', headers: { 'x-cron-secret': '' } });
    expect(res.statusCode).toBe(503);
    expect(run).not.toHaveBeenCalled();
  });
});
