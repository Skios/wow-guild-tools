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
  test('gives the character to the player; it becomes main only if they have none', async () => {
    prismaMock.character.count.mockResolvedValue(0);
    prismaMock.character.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.character.findUnique.mockResolvedValue({ id: 'c1', name: 'Brannock' });

    const claimed = await new RosterService().claim('c1', 'u1');

    expect(claimed).toEqual({ id: 'c1', name: 'Brannock' });
    expect(prismaMock.character.updateMany.mock.calls[0]![0]).toEqual({
      where: { id: 'c1', inRoster: true, userId: null },
      data: { userId: 'u1', isMain: true },
    });
  });

  test('claiming a second name keeps the current main', async () => {
    prismaMock.character.count.mockResolvedValue(1);
    prismaMock.character.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.character.findUnique.mockResolvedValue({ id: 'c1' });

    await new RosterService().claim('c1', 'u1');

    expect(prismaMock.character.updateMany.mock.calls[0]![0].data).toEqual({ userId: 'u1', isMain: false });
    expect(prismaMock.character.updateMany).toHaveBeenCalledTimes(1);
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

    expect(dto).toMatchObject({ claimed: true, username: 'aure', isMain: true });
    expect(dto).not.toHaveProperty('userId');
    expect(dto).not.toHaveProperty('inRoster');
  });

  test('an unclaimed slot has no owner', () => {
    expect(toRosterDto({ ...base, userId: null, user: null } as never)).toMatchObject({ claimed: false, username: null });
  });

  test("a claimed character shows its account's nickname; an unclaimed one keeps its own", () => {
    expect(toRosterDto({ ...base, nickname: 'old', userId: 'u1', user: { username: 'aure', nickname: 'Matte' } } as never).nickname).toBe('Matte');
    expect(toRosterDto({ ...base, nickname: 'old', userId: 'u1', user: { username: 'aure', nickname: null } } as never).nickname).toBe('old');
    expect(toRosterDto({ ...base, nickname: 'csv', userId: null, user: null } as never).nickname).toBe('csv');
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

  test("promoting a character a player owns keeps its owner, takes the officers' specs, and the nickname goes to the account", async () => {
    prismaMock.character.findUnique.mockResolvedValue({ id: 'c1', inRoster: false, userId: 'u1' });
    prismaMock.character.update.mockResolvedValue({ id: 'c1', userId: 'u1', user: { username: 'thrall', nickname: 'Matte' }, ...entry });

    await new RosterService().add({ ...entry, offSpecs: [...entry.offSpecs] });

    const { data } = prismaMock.character.update.mock.calls[0]![0];
    expect(data).toEqual({ inRoster: true, class: 'WARRIOR', spec: 'PROTECTION', role: 'TANK', offSpecs: ['FURY', 'ARMS'] });
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { nickname: 'Matte' } });
  });

  test('editing a claimed character writes the nickname to its account', async () => {
    prismaMock.character.findFirst.mockResolvedValue({ id: 'c1', inRoster: true, userId: 'u1' });
    prismaMock.character.update.mockResolvedValue({ id: 'c1', userId: 'u1', user: { username: 'thrall', nickname: 'Matte' }, ...entry });

    await new RosterService().update('c1', { ...entry, offSpecs: [...entry.offSpecs] });

    expect(prismaMock.character.update.mock.calls[0]![0].data).not.toHaveProperty('nickname');
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { nickname: 'Matte' } });
  });

  test("an empty nickname from the roster form never wipes the account's nickname", async () => {
    prismaMock.character.findFirst.mockResolvedValue({ id: 'c1', inRoster: true, userId: 'u1' });
    prismaMock.character.update.mockResolvedValue({ id: 'c1', userId: 'u1', user: { username: 'thrall', nickname: 'Matte' }, ...entry, nickname: null });

    const dto = await new RosterService().update('c1', { ...entry, offSpecs: [], nickname: null });

    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.character.update.mock.calls[0]![0].data).not.toHaveProperty('nickname');
    expect(dto.nickname).toBe('Matte');
  });

  test('editing an unclaimed slot keeps the nickname on the character', async () => {
    prismaMock.character.findFirst.mockResolvedValue({ id: 'c1', inRoster: true, userId: null });
    prismaMock.character.update.mockResolvedValue({ id: 'c1', userId: null, user: null, ...entry });

    await new RosterService().update('c1', { ...entry, offSpecs: [...entry.offSpecs] });

    expect(prismaMock.character.update.mock.calls[0]![0].data).toMatchObject({ nickname: 'Matte' });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe('RosterService.assign (officers give a roster character to an account)', () => {
  test('gives it to the account; it becomes main if they have none', async () => {
    prismaMock.character.findUnique.mockResolvedValueOnce({ id: 'c1', inRoster: true, userId: null, isMain: false });
    prismaMock.character.findFirst.mockResolvedValueOnce(null);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u2' });
    prismaMock.character.update.mockResolvedValue({ id: 'c1', userId: 'u2', user: { username: 'thrall', nickname: null }, nickname: null });

    await new RosterService().assign('c1', 'u2');

    expect(prismaMock.character.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c1' }, data: { userId: 'u2', isMain: true } }));
  });

  test('not main when the account already has one', async () => {
    prismaMock.character.findUnique.mockResolvedValueOnce({ id: 'c1', inRoster: true, userId: null, isMain: false });
    prismaMock.character.findFirst.mockResolvedValueOnce({ id: 'main' });
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u2' });
    prismaMock.character.update.mockResolvedValue({ id: 'c1', userId: 'u2', user: { username: 'thrall', nickname: null }, nickname: null });

    await new RosterService().assign('c1', 'u2');

    expect(prismaMock.character.update.mock.calls[0]![0].data).toEqual({ userId: 'u2', isMain: false });
  });

  test("moving someone's main to another account gives the previous owner a new main; works off the roster too", async () => {
    prismaMock.character.findUnique.mockResolvedValueOnce({ id: 'c1', inRoster: false, userId: 'old', isMain: true });
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u2' });
    prismaMock.character.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'old-alt' });
    prismaMock.character.update.mockResolvedValue({ id: 'c1', userId: 'u2', user: { username: 'thrall', nickname: null }, nickname: null });

    await new RosterService().assign('c1', 'u2');

    expect(prismaMock.character.update).toHaveBeenLastCalledWith({ where: { id: 'old-alt' }, data: { isMain: true } });
  });

  test('an unknown character or account is a 404', async () => {
    prismaMock.character.findUnique.mockResolvedValueOnce(null);
    await expect(new RosterService().assign('nope', 'u2')).rejects.toThrow(/character/i);
    prismaMock.character.findUnique.mockResolvedValue({ id: 'c1', inRoster: true, userId: null });
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(new RosterService().assign('c1', 'ghost')).rejects.toThrow(/account/i);
  });
});
