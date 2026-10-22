import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

import { ConflictError } from '../lib/errors.js';
import { RosterService, toRosterDto } from './roster.service.js';

beforeEach(() => resetPrismaMock());

describe('RosterService.listUnclaimed', () => {
  test('returns roster characters nobody owns, by name', async () => {
    prismaMock.character.findMany.mockResolvedValue([{ id: 'c1' }]);

    await expect(new RosterService().listUnclaimed()).resolves.toEqual([{ id: 'c1' }]);
    expect(prismaMock.character.findMany).toHaveBeenCalledWith({
      where: { inRoster: true, userId: null },
      orderBy: { name: 'asc' },
    });
  });
});

describe('RosterService.claim', () => {
  test('gives the character to the player and makes it their main', async () => {
    prismaMock.character.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.character.findUnique.mockResolvedValue({ id: 'c1', name: 'Brannock' });

    const claimed = await new RosterService().claim('c1', 'u1');

    expect(claimed).toEqual({ id: 'c1', name: 'Brannock' });
    expect(prismaMock.character.updateMany.mock.calls[0]![0]).toEqual({
      where: { id: 'c1', inRoster: true, userId: null },
      data: { userId: 'u1', isMain: true },
    });
  });

  test('the player\'s previous main character is demoted, so they still have exactly one main', async () => {
    prismaMock.character.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.character.findUnique.mockResolvedValue({ id: 'c1' });

    await new RosterService().claim('c1', 'u1');

    expect(prismaMock.character.updateMany.mock.calls[1]![0]).toEqual({
      where: { userId: 'u1', isMain: true, id: { not: 'c1' } },
      data: { isMain: false },
    });
  });

  test('409 when somebody got there first, and nothing else is touched', async () => {
    prismaMock.character.updateMany.mockResolvedValue({ count: 0 });

    await expect(new RosterService().claim('c1', 'u1')).rejects.toBeInstanceOf(ConflictError);
    expect(prismaMock.character.updateMany).toHaveBeenCalledTimes(1);
  });

  test('two players racing for the same name: only one wins', async () => {
    let taken = false; // the database lets exactly one `userId IS NULL` update succeed
    prismaMock.character.updateMany.mockImplementation(async (args: { where: { userId: unknown } }) => {
      if (args.where.userId !== null) return { count: 1 };
      if (taken) return { count: 0 };
      taken = true;
      return { count: 1 };
    });
    prismaMock.character.findUnique.mockResolvedValue({ id: 'c1' });
    const service = new RosterService();

    const results = await Promise.allSettled([service.claim('c1', 'u1'), service.claim('c1', 'u2')]);

    expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected']);
  });
});

describe('toRosterDto', () => {
  const base = {
    id: 'c1', name: 'A', realm: 'R', class: 'MAGE', spec: 'FIRE', role: 'RANGED_DPS', isMain: true, inRoster: true,
    createdAt: new Date(), updatedAt: new Date(),
  };

  test('hides internals and exposes who owns the character', () => {
    const dto = toRosterDto({ ...base, userId: 'u1', user: { username: 'aure' } } as never);

    expect(dto).toMatchObject({ claimed: true, username: 'aure' });
    expect(dto).not.toHaveProperty('userId');
    expect(dto).not.toHaveProperty('inRoster');
  });

  test('an unclaimed slot has no owner', () => {
    expect(toRosterDto({ ...base, userId: null, user: null } as never)).toMatchObject({ claimed: false, username: null });
  });
});

describe('RosterService.add', () => {
  const entry = {
    name: 'Brannock', realm: 'Silvermoon', class: 'WARRIOR', spec: 'PROTECTION', role: 'TANK',
    offSpecs: ['FURY', 'ARMS'], nickname: 'Matte',
  } as const;

  test('a new slot stores offspecs (in order) and the nickname', async () => {
    prismaMock.character.findUnique.mockResolvedValue(null);
    prismaMock.character.create.mockResolvedValue({ id: 'c1', userId: null, user: null, ...entry });

    await new RosterService().add({ ...entry, offSpecs: [...entry.offSpecs] });

    expect(prismaMock.character.create.mock.calls[0]![0].data).toMatchObject({ offSpecs: ['FURY', 'ARMS'], nickname: 'Matte', inRoster: true });
  });

  test('promoting a character a player registered keeps its owner but takes the officers\' specs and nickname', async () => {
    prismaMock.character.findUnique.mockResolvedValue({ id: 'c1', inRoster: false, userId: 'u1' });
    prismaMock.character.update.mockResolvedValue({ id: 'c1', userId: 'u1', user: { username: 'thrall' }, ...entry });

    await new RosterService().add({ ...entry, offSpecs: [...entry.offSpecs] });

    const { data } = prismaMock.character.update.mock.calls[0]![0];
    expect(data).toEqual({ inRoster: true, class: 'WARRIOR', spec: 'PROTECTION', role: 'TANK', offSpecs: ['FURY', 'ARMS'], nickname: 'Matte' });
    expect(data).not.toHaveProperty('userId');
  });
});
