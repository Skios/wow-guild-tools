import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';
import { buildOfficerRouteApp, buildRouteAppAs } from '../test/helpers.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

import { adminRoutes } from './admin.controller.js';

const app = () => buildOfficerRouteApp(adminRoutes);
beforeEach(() => resetPrismaMock());

describe('GET /meta/wow', () => {
  test('serves colours, labels and valid roles for every class, plus the role labels', async () => {
    const body = (await (await app()).inject('/meta/wow')).json();

    expect(body.classes).toHaveLength(13);
    expect(body.classes.find((c: { id: string }) => c.id === 'DEMONHUNTER')).toMatchObject({
      label: 'Demon Hunter', color: '#A330C9', roles: ['TANK', 'DPS', 'RANGED_DPS'],
    });
    expect(body.classes.find((c: { id: string }) => c.id === 'DRUID').specs).toEqual([
      { id: 'BALANCE', label: 'Balance', role: 'RANGED_DPS' },
      { id: 'FERAL', label: 'Feral', role: 'DPS' },
      { id: 'GUARDIAN', label: 'Guardian', role: 'TANK' },
      { id: 'RESTORATION', label: 'Restoration', role: 'HEALER' },
    ]);
    expect(body.classes.every((c: { specs: unknown[] }) => c.specs.length >= 3)).toBe(true);
    expect(body.roles).toEqual([
      { id: 'TANK', label: 'Tank' },
      { id: 'HEALER', label: 'Healer' },
      { id: 'DPS', label: 'Melee DPS' },
      { id: 'RANGED_DPS', label: 'Ranged DPS' },
    ]);
  });
});

describe('GET /characters', () => {
  test('is for people who build event rosters, not every signed-in Raider', async () => {
    const res = await (await buildRouteAppAs([], adminRoutes)).inject('/characters');
    expect(res.statusCode).toBe(403);
    expect(prismaMock.character.findMany).not.toHaveBeenCalled();
  });

  const row = (name: string, isMain: boolean) => ({
    id: name, name, realm: 'Silvermoon', class: 'MAGE', role: 'RANGED_DPS', isMain, user: { username: 'u' } as { username: string } | null,
  });

  test('lists characters with their owner', async () => {
    prismaMock.character.findMany.mockResolvedValue([row('Jaina', true)]);

    const res = await (await app()).inject('/characters');

    expect(res.statusCode).toBe(200);
    expect(res.json()[0]).toMatchObject({ name: 'Jaina', username: 'u', class: 'MAGE' });
    expect(res.json()[0]).not.toHaveProperty('user');
  });

  test('an unclaimed roster slot has no owner', async () => {
    prismaMock.character.findMany.mockResolvedValue([{ ...row('Brannock', false), user: null }]);

    const res = await (await app()).inject('/characters');

    expect(res.json()[0].username).toBeNull();
  });

  test('filters by name, case-insensitively and trimmed', async () => {
    prismaMock.character.findMany.mockResolvedValue([]);

    await (await app()).inject('/characters?search=%20jai%20');

    expect(prismaMock.character.findMany.mock.calls[0]![0].where).toEqual({
      name: { contains: 'jai', mode: 'insensitive' },
    });
  });

  test('a blank search means no filter', async () => {
    prismaMock.character.findMany.mockResolvedValue([]);
    await (await app()).inject('/characters?search=%20%20');
    expect(prismaMock.character.findMany.mock.calls[0]![0].where).toEqual({});
  });

  test('caps the number of rows', async () => {
    prismaMock.character.findMany.mockResolvedValue([]);
    await (await app()).inject('/characters');
    expect(prismaMock.character.findMany.mock.calls[0]![0].take).toBe(200);
  });

  test('400 for an absurdly long search', async () => {
    expect((await (await app()).inject(`/characters?search=${'a'.repeat(51)}`)).statusCode).toBe(400);
  });

  test("search text is data, not a query: LIKE wildcards are passed through the ORM untouched", async () => {
    prismaMock.character.findMany.mockResolvedValue([]);
    const res = await (await app()).inject("/characters?search=%25'%3B--");
    expect(res.statusCode).toBe(200);
  });
});
