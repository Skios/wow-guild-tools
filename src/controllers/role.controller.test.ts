import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';
import { buildRouteAppFor, uuid } from '../test/helpers.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

import { roleRoutes } from './role.controller.js';

const R = uuid(7);
const U = uuid(8);
const asOwner = () => buildRouteAppFor({ isOwner: true, role: 'Owner', position: 0 }, roleRoutes);
const asRaider = () => buildRouteAppFor({ role: 'Raider', position: 40 }, roleRoutes);
const asOfficer = () => buildRouteAppFor({ capabilities: ['accounts.manage'] }, roleRoutes);
const role = { name: 'Raid Assist', position: 25, capabilities: [] };

beforeEach(() => resetPrismaMock());

describe('roles', () => {
  test('any signed-in user can see the roles', async () => {
    prismaMock.role.findMany.mockResolvedValue([]);
    expect((await (await asRaider()).inject('/roles')).statusCode).toBe(200);
  });

  test('the capabilities offered are the ones the routes registered', async () => {
    const res = await (await asOwner()).inject('/roles/capabilities');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toContain('accounts.manage');
  });

  test.each([
    ['GET', '/roles/capabilities'],
    ['POST', '/roles'],
    ['PUT', `/roles/${R}`],
    ['DELETE', `/roles/${R}`],
  ] as const)('%s %s is for the Owner only', async (method, url) => {
    const res = await (await asOfficer()).inject({ method, url, payload: role });
    expect(res.statusCode).toBe(403);
    expect(prismaMock.role.create).not.toHaveBeenCalled();
  });

  test('the Owner creates, edits and deletes roles', async () => {
    const app = await asOwner();
    prismaMock.role.create.mockResolvedValue({ id: R, ...role });
    prismaMock.role.findUnique.mockResolvedValue({ id: R, ...role, isOwner: false, isDefault: false, _count: { users: 0 } });
    prismaMock.role.update.mockResolvedValue({ id: R, ...role });

    expect((await app.inject({ method: 'POST', url: '/roles', payload: role })).statusCode).toBe(201);
    expect((await app.inject({ method: 'PUT', url: `/roles/${R}`, payload: role })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/roles/${R}` })).statusCode).toBe(204);
  });

  test('a bad role id or body is a 400', async () => {
    const app = await asOwner();
    expect((await app.inject({ method: 'PUT', url: '/roles/nope', payload: role })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/roles', payload: { name: 'x' } })).statusCode).toBe(400);
  });
});

describe('PUT /users/:id/role', () => {
  test('needs accounts.manage', async () => {
    const res = await (await asRaider()).inject({ method: 'PUT', url: `/users/${U}/role`, payload: { roleId: R } });
    expect(res.statusCode).toBe(403);
  });

  test('gives the role, following the hierarchy rules', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: U, role: { name: 'Raider', position: 40, capabilities: [], isOwner: false } });
    prismaMock.role.findUnique.mockResolvedValue({ id: R, name: 'Officer', position: 20, capabilities: [], isOwner: false });

    const res = await (await asOfficer()).inject({ method: 'PUT', url: `/users/${U}/role`, payload: { roleId: R } });

    expect(res.statusCode).toBe(204);
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: U }, data: { roleId: R } });
  });

  test('a role above yours is refused with the reason', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: U, role: null });
    prismaMock.role.findUnique.mockResolvedValue({ id: R, name: 'Guildmaster', position: 10, capabilities: [], isOwner: false });

    const res = await (await asOfficer()).inject({ method: 'PUT', url: `/users/${U}/role`, payload: { roleId: R } });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/equal to or below/);
  });
});
