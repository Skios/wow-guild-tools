import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

import { registerCapability } from '../domain/roles.js';
import { AppError, ConflictError, NotFoundError } from '../lib/errors.js';
import type { Officer } from '../plugins/auth.js';
import { RoleService } from './role.service.js';

const OWNER_ROLE = { id: 'r0', name: 'Owner', position: 0, capabilities: [], isOwner: true, isDefault: false };
const OFFICER_ROLE = { id: 'r2', name: 'Officer', position: 20, capabilities: ['accounts.manage'], isOwner: false, isDefault: false };
const RAIDER_ROLE = { id: 'r4', name: 'Raider', position: 40, capabilities: [], isOwner: false, isDefault: true };
const officer: Officer = { userId: 'me', username: 'raidlead', role: 'Officer', position: 20, isOwner: false, capabilities: ['accounts.manage'] };
const owner: Officer = { ...officer, username: 'gm', role: 'Owner', position: 0, isOwner: true };

let roles: RoleService;
beforeEach(() => {
  resetPrismaMock();
  registerCapability('roster.manage');
  roles = new RoleService();
});

describe('RoleService.list', () => {
  test('lists roles highest first with how many accounts hold each', async () => {
    prismaMock.role.findMany.mockResolvedValue([{ ...OWNER_ROLE, _count: { users: 1 } }]);

    await expect(roles.list()).resolves.toEqual([{ ...OWNER_ROLE, users: 1 }]);
    expect(prismaMock.role.findMany.mock.calls[0]![0].orderBy).toEqual([{ position: 'asc' }, { name: 'asc' }]);
  });
});

describe('RoleService.create / update', () => {
  test('creates a role with known capabilities', async () => {
    prismaMock.role.create.mockResolvedValue({ id: 'new' });

    await roles.create({ name: ' Raid Assist ', position: 25, capabilities: ['roster.manage'] });

    expect(prismaMock.role.create).toHaveBeenCalledWith({ data: { name: 'Raid Assist', position: 25, capabilities: ['roster.manage'] } });
  });

  test.each([
    [{ name: 'X', position: 25, capabilities: [] }, /name/i],
    [{ name: 'Assist', position: 0, capabilities: [] }, /position/i],
    [{ name: 'Assist', position: 25, capabilities: ['made.up'] }, /made\.up/],
    [{ name: 'Assist', position: 25, capabilities: ['roster.manage', 'roster.manage'] }, /twice/i],
    [{ name: 'Assist', position: 25, capabilities: [], isOwner: true }, /isOwner|unrecognized/i],
  ])('refuses %j', async (input, message) => {
    await expect(roles.create(input)).rejects.toThrow(message);
    expect(prismaMock.role.create).not.toHaveBeenCalled();
  });

  test('updates a role', async () => {
    prismaMock.role.findUnique.mockResolvedValue(OFFICER_ROLE);
    prismaMock.role.update.mockResolvedValue({ id: 'r2' });

    await roles.update('r2', { name: 'Officer', position: 15, capabilities: [] });

    expect(prismaMock.role.update).toHaveBeenCalledWith({ where: { id: 'r2' }, data: { name: 'Officer', position: 15, capabilities: [] } });
  });

  test('the Owner role cannot be changed', async () => {
    prismaMock.role.findUnique.mockResolvedValue(OWNER_ROLE);

    await expect(roles.update('r0', { name: 'Boss', position: 1, capabilities: [] })).rejects.toBeInstanceOf(ConflictError);
    expect(prismaMock.role.update).not.toHaveBeenCalled();
  });

  test('an unknown role is a 404', async () => {
    prismaMock.role.findUnique.mockResolvedValue(null);
    await expect(roles.update('nope', { name: 'Boss', position: 1, capabilities: [] })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('RoleService.remove', () => {
  test('deletes a role nobody holds', async () => {
    prismaMock.role.findUnique.mockResolvedValue({ ...OFFICER_ROLE, _count: { users: 0 } });

    await roles.remove('r2');

    expect(prismaMock.role.delete).toHaveBeenCalledWith({ where: { id: 'r2' } });
  });

  test.each([
    ['the Owner role', { ...OWNER_ROLE, _count: { users: 0 } }, /Owner/],
    ['the default role', { ...RAIDER_ROLE, _count: { users: 0 } }, /new accounts/i],
    ['a role someone holds', { ...OFFICER_ROLE, _count: { users: 3 } }, /3 accounts/],
  ])('refuses %s', async (_label, role, message) => {
    prismaMock.role.findUnique.mockResolvedValue(role);

    await expect(roles.remove(role.id)).rejects.toThrow(message);
    expect(prismaMock.role.delete).not.toHaveBeenCalled();
  });
});

describe('RoleService.assign', () => {
  const target = (role: object | null) => prismaMock.user.findUnique.mockResolvedValue({ id: 'them', role });

  test('an Officer gives a Raider the Officer role', async () => {
    target(RAIDER_ROLE);
    prismaMock.role.findUnique.mockResolvedValue(OFFICER_ROLE);

    await roles.assign(officer, 'them', 'r2');

    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'them' }, data: { roleId: 'r2' } });
  });

  test('a rule violation is a 403 with the reason', async () => {
    target(OFFICER_ROLE);
    prismaMock.role.findUnique.mockResolvedValue(RAIDER_ROLE);

    const error = await roles.assign(officer, 'them', 'r4').catch(e => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 403, message: expect.stringMatching(/below you/) });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  test('the Owner can make someone else Owner', async () => {
    target(RAIDER_ROLE);
    prismaMock.role.findUnique.mockResolvedValue(OWNER_ROLE);

    await roles.assign(owner, 'them', 'r0');

    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'them' }, data: { roleId: 'r0' } });
  });

  test('unknown user or role is a 404', async () => {
    target(null);
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    prismaMock.role.findUnique.mockResolvedValue(OFFICER_ROLE);
    await expect(roles.assign(officer, 'ghost', 'r2')).rejects.toBeInstanceOf(NotFoundError);

    target(RAIDER_ROLE);
    prismaMock.role.findUnique.mockResolvedValue(null);
    await expect(roles.assign(officer, 'them', 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});
