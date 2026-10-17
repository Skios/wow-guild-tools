import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';
import { buildRouteApp, prismaError, uuid } from '../test/helpers.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

import { groupRoutes } from './group.controller.js';

const G = uuid(1);
const U = uuid(2);
const app = () => buildRouteApp(groupRoutes);

beforeEach(() => resetPrismaMock());

describe('POST /groups', () => {
  test('creates a group', async () => {
    prismaMock.rosterGroup.create.mockResolvedValue({ id: G, name: 'Core' });

    const res = await (await app()).inject({ method: 'POST', url: '/groups', payload: { name: ' Core ' } });

    expect(res.statusCode).toBe(201);
    expect(prismaMock.rosterGroup.create).toHaveBeenCalledWith({ data: { name: 'Core', description: null } });
  });

  test.each([{}, { name: '' }, { name: '   ' }, { name: 'x'.repeat(51) }, { name: 5 }])('400 for %j', async (payload) => {
    const res = await (await app()).inject({ method: 'POST', url: '/groups', payload });
    expect(res.statusCode).toBe(400);
    expect(prismaMock.rosterGroup.create).not.toHaveBeenCalled();
  });

  test('409 for a duplicate name, without leaking the database message', async () => {
    prismaMock.rosterGroup.create.mockRejectedValue(prismaError('P2002'));

    const res = await (await app()).inject({ method: 'POST', url: '/groups', payload: { name: 'Core' } });

    expect(res.statusCode).toBe(409);
    expect(res.body).not.toContain('users_secret');
  });
});

describe('GET /groups', () => {
  test('lists groups', async () => {
    prismaMock.rosterGroup.findMany.mockResolvedValue([{ id: G }]);
    const res = await (await app()).inject('/groups');
    expect(res.json()).toEqual([{ id: G }]);
  });

  test('returns an empty list when there are none', async () => {
    prismaMock.rosterGroup.findMany.mockResolvedValue([]);
    expect((await (await app()).inject('/groups')).json()).toEqual([]);
  });
});

describe('GET /groups/:id', () => {
  test('returns the group with members', async () => {
    prismaMock.rosterGroup.findUnique.mockResolvedValue({ id: G, members: [] });
    expect((await (await app()).inject(`/groups/${G}`)).statusCode).toBe(200);
  });

  test('404 for an unknown group instead of 200 null', async () => {
    prismaMock.rosterGroup.findUnique.mockResolvedValue(null);
    expect((await (await app()).inject(`/groups/${G}`)).statusCode).toBe(404);
  });

  test.each(['abc', '..%2F..%2Fetc', '1'])('400 for the id %s', async (id) => {
    expect((await (await app()).inject(`/groups/${id}`)).statusCode).toBe(400);
  });
});

describe('members', () => {
  test('adds a member', async () => {
    prismaMock.groupMember.upsert.mockResolvedValue({});
    const res = await (await app()).inject({ method: 'POST', url: `/groups/${G}/members`, payload: { userId: U } });
    expect(res.statusCode).toBe(200);
  });

  test('adding the same member twice is harmless', async () => {
    prismaMock.groupMember.upsert.mockResolvedValue({});
    const server = await app();
    await server.inject({ method: 'POST', url: `/groups/${G}/members`, payload: { userId: U } });
    const second = await server.inject({ method: 'POST', url: `/groups/${G}/members`, payload: { userId: U } });
    expect(second.statusCode).toBe(200);
  });

  test.each([{}, { userId: 'x' }, { userId: null }, undefined])('400 for the body %j', async (payload) => {
    const res = await (await app()).inject({ method: 'POST', url: `/groups/${G}/members`, ...(payload !== undefined && { payload }) });
    expect(res.statusCode).toBe(400);
  });

  test('400 when the user or group does not exist', async () => {
    prismaMock.groupMember.upsert.mockRejectedValue(prismaError('P2003'));
    const res = await (await app()).inject({ method: 'POST', url: `/groups/${G}/members`, payload: { userId: U } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Invalid reference' });
  });

  test('removes a member', async () => {
    prismaMock.groupMember.delete.mockResolvedValue({});
    expect((await (await app()).inject({ method: 'DELETE', url: `/groups/${G}/members/${U}` })).statusCode).toBe(200);
  });

  test('404 when removing someone who is not a member', async () => {
    prismaMock.groupMember.delete.mockRejectedValue(prismaError('P2025'));
    expect((await (await app()).inject({ method: 'DELETE', url: `/groups/${G}/members/${U}` })).statusCode).toBe(404);
  });

  test('400 for malformed ids', async () => {
    expect((await (await app()).inject({ method: 'DELETE', url: `/groups/${G}/members/nope` })).statusCode).toBe(400);
  });
});

describe('DELETE /groups/:id', () => {
  test('deletes', async () => {
    prismaMock.rosterGroup.delete.mockResolvedValue({});
    expect((await (await app()).inject({ method: 'DELETE', url: `/groups/${G}` })).statusCode).toBe(200);
  });

  test('404 for an unknown group', async () => {
    prismaMock.rosterGroup.delete.mockRejectedValue(prismaError('P2025'));
    expect((await (await app()).inject({ method: 'DELETE', url: `/groups/${G}` })).statusCode).toBe(404);
  });

  test('409 would not be silently swallowed: a group with members is deleted only if the database allows it', async () => {
    prismaMock.rosterGroup.delete.mockRejectedValue(prismaError('P2003'));
    const res = await (await app()).inject({ method: 'DELETE', url: `/groups/${G}` });
    expect(res.statusCode).toBe(400);
  });
});
