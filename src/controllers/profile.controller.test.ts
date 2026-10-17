import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';
import { buildRouteApp, prismaError, uuid } from '../test/helpers.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

import { profileRoutes } from './profile.controller.js';

const U = uuid(1);
const C = uuid(2);
const app = () => buildRouteApp(profileRoutes);
const character = { userId: U, name: 'Thrall', realm: 'Silvermoon', class: 'SHAMAN', role: 'HEALER' };

beforeEach(() => {
  resetPrismaMock();
  prismaMock.user.findUnique.mockResolvedValue({ id: U });
});

describe('POST /profiles/characters', () => {
  test('adds an alt (never main by default)', async () => {
    prismaMock.character.create.mockResolvedValue({ id: C });

    const res = await (await app()).inject({ method: 'POST', url: '/profiles/characters', payload: character });

    expect(res.statusCode).toBe(201);
    expect(prismaMock.character.create.mock.calls[0]![0].data.isMain).toBe(false);
  });

  test('normalises the name capitalisation', async () => {
    prismaMock.character.create.mockResolvedValue({ id: C });

    await (await app()).inject({ method: 'POST', url: '/profiles/characters', payload: { ...character, name: 'tHRALL' } });

    expect(prismaMock.character.create.mock.calls[0]![0].data.name).toBe('Thrall');
  });

  test.each([
    { class: 'MAGE', role: 'TANK' },
    { class: 'NINJA' },
    { role: 'BARD' },
    { name: 'Thr4ll' },
    { realm: '<script>' },
    { userId: 'nope' },
  ])('400 for %j', async (patch) => {
    const res = await (await app()).inject({ method: 'POST', url: '/profiles/characters', payload: { ...character, ...patch } });
    expect(res.statusCode).toBe(400);
    expect(prismaMock.character.create).not.toHaveBeenCalled();
  });

  test('404 for an unknown user', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await (await app()).inject({ method: 'POST', url: '/profiles/characters', payload: character });
    expect(res.statusCode).toBe(404);
  });

  test('409 when the character is already registered by someone', async () => {
    prismaMock.character.create.mockRejectedValue(prismaError('P2002'));
    const res = await (await app()).inject({ method: 'POST', url: '/profiles/characters', payload: character });
    expect(res.statusCode).toBe(409);
  });
});

describe('PUT /profiles/main-character/:id', () => {
  test('makes one of the user characters the main one', async () => {
    prismaMock.character.findFirst.mockResolvedValue({ id: C, userId: U });
    prismaMock.character.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.character.update.mockResolvedValue({ id: C, isMain: true });

    const res = await (await app()).inject({ method: 'PUT', url: `/profiles/main-character/${C}`, payload: { userId: U } });

    expect(res.statusCode).toBe(200);
    expect(prismaMock.character.findFirst).toHaveBeenCalledWith({ where: { id: C, userId: U } });
  });

  test("404 when the character belongs to somebody else, and the user's current main is untouched", async () => {
    prismaMock.character.findFirst.mockResolvedValue(null);

    const res = await (await app()).inject({ method: 'PUT', url: `/profiles/main-character/${C}`, payload: { userId: U } });

    expect(res.statusCode).toBe(404);
    expect(prismaMock.character.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.character.update).not.toHaveBeenCalled();
  });

  test.each([{}, { userId: 'x' }, undefined])('400 for the body %j', async (payload) => {
    const res = await (await app()).inject({ method: 'PUT', url: `/profiles/main-character/${C}`, ...(payload !== undefined && { payload }) });
    expect(res.statusCode).toBe(400);
  });

  test('400 for a malformed character id', async () => {
    const res = await (await app()).inject({ method: 'PUT', url: '/profiles/main-character/abc', payload: { userId: U } });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /profiles/me/:id', () => {
  test('returns the profile with characters', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: U, characters: [] });
    expect((await (await app()).inject(`/profiles/me/${U}`)).statusCode).toBe(200);
  });

  test('404 for an unknown user instead of 200 null', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    expect((await (await app()).inject(`/profiles/me/${U}`)).statusCode).toBe(404);
  });

  test('400 for a malformed id', async () => {
    expect((await (await app()).inject('/profiles/me/xyz')).statusCode).toBe(400);
  });
});
