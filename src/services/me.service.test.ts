import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

import { ConflictError, NotFoundError } from '../lib/errors.js';
import { MeService } from './me.service.js';

const ME = 'u1';
const me = new MeService();
const warrior = { name: 'Ulfgaar', realm: "Pozzo dell'Eternità", class: 'WARRIOR', spec: 'PROTECTION', offSpecs: ['FURY'] };
const mine = (over = {}) => ({ id: 'c1', userId: ME, class: 'WARRIOR', name: 'Ulfgaar', realm: 'X', inRoster: false, isMain: true, ...over });

beforeEach(() => resetPrismaMock());

describe('profile', () => {
  test('summary: names, role, channels and characters (main first)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      username: 'mrcid', nickname: 'Matte', preferredChannel: 'telegram', role: { name: 'Owner' },
      identities: [{ platform: 'telegram' }], characters: [{ id: 'c1' }],
    });

    await expect(me.profile(ME)).resolves.toEqual({
      username: 'mrcid', nickname: 'Matte', role: 'Owner', preferredChannel: 'telegram',
      channels: { telegram: true }, characters: [{ id: 'c1' }],
    });
    expect(prismaMock.user.findUnique.mock.calls[0]![0].select.characters.orderBy).toEqual([{ isMain: 'desc' }, { name: 'asc' }]);
  });

  test('sets the nickname (trimmed, empty clears it) and refuses odd characters', async () => {
    await me.setNickname(ME, '  Matte ');
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: ME }, data: { nickname: 'Matte' } });
    await me.setNickname(ME, '');
    expect(prismaMock.user.update).toHaveBeenLastCalledWith({ where: { id: ME }, data: { nickname: null } });
    await expect(me.setNickname(ME, '<script>')).rejects.toThrow();
  });
});

describe('characters', () => {
  test('adds a new character, out of the roster until an officer approves it; the first becomes main', async () => {
    prismaMock.character.findUnique.mockResolvedValue(null);
    prismaMock.character.count.mockResolvedValue(0);
    prismaMock.character.create.mockResolvedValue({ id: 'c9' });

    await me.addCharacter(ME, warrior);

    expect(prismaMock.character.create).toHaveBeenCalledWith({
      data: { name: 'Ulfgaar', realm: "Pozzo dell'Eternità", class: 'WARRIOR', spec: 'PROTECTION', role: 'TANK', offSpecs: ['FURY'], userId: ME, inRoster: false, isMain: true },
    });
  });

  test('a second character is not main', async () => {
    prismaMock.character.findUnique.mockResolvedValue(null);
    prismaMock.character.count.mockResolvedValue(1);
    await me.addCharacter(ME, warrior);
    expect(prismaMock.character.create.mock.calls[0]![0].data.isMain).toBe(false);
  });

  test.each([
    ['a free roster name: claim it instead', { userId: null, inRoster: true }, /claim/],
    ["someone else's character", { userId: 'other', inRoster: true }, /another player/],
  ])('refuses %s', async (_label, existing, reason) => {
    prismaMock.character.findUnique.mockResolvedValue({ id: 'c5', ...existing });
    await expect(me.addCharacter(ME, warrior)).rejects.toThrow(reason);
    expect(prismaMock.character.create).not.toHaveBeenCalled();
  });

  test('an unowned character off the roster can be taken back; one I already have says so', async () => {
    prismaMock.character.findUnique.mockResolvedValue({ id: 'c5', userId: null, inRoster: false });
    prismaMock.character.count.mockResolvedValue(1);
    await me.addCharacter(ME, warrior);
    expect(prismaMock.character.update).toHaveBeenCalledWith({
      where: { id: 'c5' }, data: { spec: 'PROTECTION', role: 'TANK', offSpecs: ['FURY'], class: 'WARRIOR', userId: ME, isMain: false },
    });

    prismaMock.character.findUnique.mockResolvedValue({ id: 'c5', userId: ME, inRoster: false });
    await expect(me.addCharacter(ME, warrior)).rejects.toThrow(/already have/);
  });

  test('at most 20 characters per account', async () => {
    prismaMock.character.findUnique.mockResolvedValue(null);
    prismaMock.character.count.mockResolvedValue(20);
    await expect(me.addCharacter(ME, warrior)).rejects.toThrow(/20/);
    expect(prismaMock.character.create).not.toHaveBeenCalled();
  });

  test('removing my main makes my oldest other character the main', async () => {
    prismaMock.character.findFirst.mockResolvedValueOnce(mine({ inRoster: true, isMain: true })).mockResolvedValueOnce({ id: 'c2' });
    await me.removeCharacter(ME, 'c1');
    expect(prismaMock.character.findFirst).toHaveBeenLastCalledWith({ where: { userId: ME, id: { not: 'c1' } }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    expect(prismaMock.character.update).toHaveBeenLastCalledWith({ where: { id: 'c2' }, data: { isMain: true } });
  });

  test('a spec of another class is refused', async () => {
    await expect(me.addCharacter(ME, { ...warrior, spec: 'FIRE' })).rejects.toThrow();
  });

  test('claims a free roster name', async () => {
    prismaMock.character.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.character.findUnique.mockResolvedValue({ id: 'c5' });
    await me.claim(ME, 'c5');
    expect(prismaMock.character.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c5', inRoster: true, userId: null } }));
  });

  test('changes specs of my own character only, role following the spec', async () => {
    prismaMock.character.findFirst.mockResolvedValue(mine());
    await me.updateCharacter(ME, 'c1', { spec: 'FURY', offSpecs: ['ARMS', 'PROTECTION'] });
    expect(prismaMock.character.findFirst).toHaveBeenCalledWith({ where: { id: 'c1', userId: ME } });
    expect(prismaMock.character.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { spec: 'FURY', role: 'DPS', offSpecs: ['ARMS', 'PROTECTION'] } });

    prismaMock.character.findFirst.mockResolvedValue(null);
    await expect(me.updateCharacter(ME, 'cX', { spec: 'FURY', offSpecs: [] })).rejects.toBeInstanceOf(NotFoundError);
  });

  test('makes one of my characters the main', async () => {
    prismaMock.character.findFirst.mockResolvedValue(mine({ isMain: false }));
    await me.setMain(ME, 'c1');
    expect(prismaMock.character.updateMany).toHaveBeenCalledWith({ where: { userId: ME, isMain: true }, data: { isMain: false } });
    expect(prismaMock.character.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { isMain: true } });
  });

  test('removing: a roster character (or one with answers) is released, a fresh one is deleted', async () => {
    prismaMock.character.findFirst.mockResolvedValue(mine({ inRoster: true, isMain: false }));
    await me.removeCharacter(ME, 'c1');
    expect(prismaMock.character.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { userId: null, isMain: false } });

    resetPrismaMock();
    prismaMock.character.findFirst.mockResolvedValue(mine({ isMain: false }));
    prismaMock.response.count.mockResolvedValue(0);
    await me.removeCharacter(ME, 'c1');
    expect(prismaMock.character.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });

    resetPrismaMock();
    prismaMock.character.findFirst.mockResolvedValue(mine({ isMain: false }));
    prismaMock.response.count.mockResolvedValue(2);
    await me.removeCharacter(ME, 'c1');
    expect(prismaMock.character.delete).not.toHaveBeenCalled();
    expect(prismaMock.character.update).toHaveBeenCalled();
  });

  test('lists the roster names nobody has claimed', async () => {
    prismaMock.character.findMany.mockResolvedValue([{ id: 'c5', name: 'Thrall' }]);
    await expect(me.claimable()).resolves.toEqual([{ id: 'c5', name: 'Thrall' }]);
  });

  test('ConflictError is exported for callers', () => expect(ConflictError).toBeDefined());
});
