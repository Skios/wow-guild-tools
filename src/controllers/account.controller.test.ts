import { beforeEach, describe, expect, test, vi } from 'vitest';
import { buildRouteAppFor, uuid } from '../test/helpers.js';
import { accountRoutes } from './account.controller.js';

const U = uuid(5);
const accounts = { listAccounts: vi.fn(), resetPasswordFor: vi.fn(), changeOwnPassword: vi.fn() };
const as = (over = {}, service: typeof accounts | null = accounts) => buildRouteAppFor(over, accountRoutes(service));
const manager = { capabilities: ['accounts.manage'] };

beforeEach(() => {
  Object.values(accounts).forEach(fn => fn.mockReset());
  accounts.listAccounts.mockResolvedValue([{ id: U, username: 'newbie' }]);
  accounts.resetPasswordFor.mockResolvedValue('Temp-password-123');
});

describe('GET /users', () => {
  test('lists accounts for whoever manages them', async () => {
    const res = await (await as(manager)).inject('/users');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ id: U, username: 'newbie' }]);
  });

  test('is 403 without accounts.manage', async () => {
    expect((await (await as()).inject('/users')).statusCode).toBe(403);
    expect(accounts.listAccounts).not.toHaveBeenCalled();
  });

  test('is 503 when the API has no Supabase secret key', async () => {
    expect((await (await as(manager, null)).inject('/users')).statusCode).toBe(503);
  });
});

describe('POST /users/:id/password-reset', () => {
  test('returns the temporary password once, passing who asks', async () => {
    const res = await (await as(manager)).inject({ method: 'POST', url: `/users/${U}/password-reset` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ password: 'Temp-password-123' });
    expect(accounts.resetPasswordFor).toHaveBeenCalledWith(expect.objectContaining({ userId: uuid(1) }), U);
  });

  test('needs accounts.manage and a valid id', async () => {
    expect((await (await as()).inject({ method: 'POST', url: `/users/${U}/password-reset` })).statusCode).toBe(403);
    expect((await (await as(manager)).inject({ method: 'POST', url: '/users/nope/password-reset' })).statusCode).toBe(400);
  });
});

describe('POST /auth/password', () => {
  test('anyone signed in changes their own password', async () => {
    const res = await (await as()).inject({ method: 'POST', url: '/auth/password', payload: { currentPassword: 'Old-pass-1234', password: 'Correct-horse1' } });

    expect(res.statusCode).toBe(204);
    expect(accounts.changeOwnPassword).toHaveBeenCalledWith(uuid(1), 'Officer', 'Old-pass-1234', 'Correct-horse1');
  });

  test('a body without both passwords is a 400', async () => {
    expect((await (await as()).inject({ method: 'POST', url: '/auth/password', payload: {} })).statusCode).toBe(400);
    expect((await (await as()).inject({ method: 'POST', url: '/auth/password', payload: { password: 'Correct-horse1' } })).statusCode).toBe(400);
    expect(accounts.changeOwnPassword).not.toHaveBeenCalled();
  });
});
