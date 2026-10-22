import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';
import { buildRouteApp, prismaError, uuid } from '../test/helpers.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

import { rosterRoutes } from './roster.controller.js';

const C = uuid(1);
const app = () => buildRouteApp(rosterRoutes);
const entry = { name: 'Brannock', realm: 'Silvermoon', class: 'WARRIOR', spec: 'PROTECTION' };
const stored = (over = {}) => ({
  id: C, name: 'Brannock', realm: 'Silvermoon', class: 'WARRIOR', spec: 'PROTECTION', role: 'TANK',
  userId: null, isMain: false, inRoster: true, user: null, ...over,
});

beforeEach(() => resetPrismaMock());

describe('GET /roster', () => {
  test('lists the roster, saying who has claimed each name', async () => {
    prismaMock.character.findMany.mockResolvedValue([stored(), stored({ id: uuid(2), name: 'Aurelion', userId: 'u1', user: { username: 'aure' } })]);

    const res = await (await app()).inject('/roster');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      expect.objectContaining({ name: 'Brannock', claimed: false, username: null }),
      expect.objectContaining({ name: 'Aurelion', claimed: true, username: 'aure' }),
    ]);
    expect(prismaMock.character.findMany.mock.calls[0]![0].where).toEqual({ inRoster: true });
  });

  test('an empty roster is an empty list', async () => {
    prismaMock.character.findMany.mockResolvedValue([]);
    expect((await (await app()).inject('/roster')).json()).toEqual([]);
  });
});

describe('POST /roster', () => {
  test('creates an unclaimed roster slot with the role taken from the spec', async () => {
    prismaMock.character.findUnique.mockResolvedValue(null);
    prismaMock.character.create.mockResolvedValue(stored());

    const res = await (await app()).inject({ method: 'POST', url: '/roster', payload: entry });

    expect(res.statusCode).toBe(201);
    expect(prismaMock.character.create.mock.calls[0]![0].data).toEqual({
      ...entry, role: 'TANK', offSpecs: [], nickname: null, userId: null, isMain: false, inRoster: true,
    });
  });

  test('a character a player already registered is promoted into the roster, keeping its owner', async () => {
    prismaMock.character.findUnique.mockResolvedValue(stored({ inRoster: false, userId: 'u1' }));
    prismaMock.character.update.mockResolvedValue(stored({ userId: 'u1' }));

    const res = await (await app()).inject({ method: 'POST', url: '/roster', payload: entry });

    expect(res.statusCode).toBe(200);
    expect(prismaMock.character.update.mock.calls[0]![0].data).toMatchObject({ inRoster: true, spec: 'PROTECTION', role: 'TANK' });
    expect(prismaMock.character.update.mock.calls[0]![0].data).not.toHaveProperty('userId');
    expect(prismaMock.character.create).not.toHaveBeenCalled();
  });

  test('409 when the character is already in the roster', async () => {
    prismaMock.character.findUnique.mockResolvedValue(stored());

    const res = await (await app()).inject({ method: 'POST', url: '/roster', payload: entry });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/already/i);
  });

  test('409 if two officers add the same name at the same moment', async () => {
    prismaMock.character.findUnique.mockResolvedValue(null);
    prismaMock.character.create.mockRejectedValue(prismaError('P2002'));

    expect((await (await app()).inject({ method: 'POST', url: '/roster', payload: entry })).statusCode).toBe(409);
  });

  test.each([{ spec: 'FIRE' }, { name: 'X' }, { class: 'NINJA' }, {}])('400 for %j', async (patch) => {
    const payload = Object.keys(patch).length ? { ...entry, ...patch } : {};
    const res = await (await app()).inject({ method: 'POST', url: '/roster', payload });
    expect(res.statusCode).toBe(400);
    expect(prismaMock.character.create).not.toHaveBeenCalled();
  });
});

describe('PUT /roster/:id', () => {
  test('edits a roster character', async () => {
    prismaMock.character.findFirst.mockResolvedValue(stored());
    prismaMock.character.update.mockResolvedValue(stored({ spec: 'FURY', role: 'DPS' }));

    const res = await (await app()).inject({ method: 'PUT', url: `/roster/${C}`, payload: { ...entry, spec: 'FURY' } });

    expect(res.statusCode).toBe(200);
    expect(prismaMock.character.update.mock.calls[0]![0].data).toMatchObject({ spec: 'FURY', role: 'DPS' });
  });

  test('404 for a character that is not in the roster', async () => {
    prismaMock.character.findFirst.mockResolvedValue(null);
    expect((await (await app()).inject({ method: 'PUT', url: `/roster/${C}`, payload: entry })).statusCode).toBe(404);
    expect(prismaMock.character.findFirst).toHaveBeenCalledWith({ where: { id: C, inRoster: true } });
  });

  test('409 when renaming onto a character that already exists', async () => {
    prismaMock.character.findFirst.mockResolvedValue(stored());
    prismaMock.character.update.mockRejectedValue(prismaError('P2002'));

    expect((await (await app()).inject({ method: 'PUT', url: `/roster/${C}`, payload: entry })).statusCode).toBe(409);
  });

  test('400 for a malformed id or body', async () => {
    expect((await (await app()).inject({ method: 'PUT', url: '/roster/abc', payload: entry })).statusCode).toBe(400);
    expect((await (await app()).inject({ method: 'PUT', url: `/roster/${C}`, payload: { ...entry, spec: 'FIRE' } })).statusCode).toBe(400);
  });
});

describe('DELETE /roster/:id', () => {
  test('deletes an unclaimed slot nobody answered for', async () => {
    prismaMock.character.findFirst.mockResolvedValue(stored());
    prismaMock.response.count.mockResolvedValue(0);
    prismaMock.character.delete.mockResolvedValue({});

    const res = await (await app()).inject({ method: 'DELETE', url: `/roster/${C}` });

    expect(res.statusCode).toBe(200);
    expect(prismaMock.character.delete).toHaveBeenCalledWith({ where: { id: C } });
  });

  test('only takes a claimed character off the roster: the player keeps their character', async () => {
    prismaMock.character.findFirst.mockResolvedValue(stored({ userId: 'u1' }));
    prismaMock.character.update.mockResolvedValue({});

    await (await app()).inject({ method: 'DELETE', url: `/roster/${C}` });

    expect(prismaMock.character.update).toHaveBeenCalledWith({ where: { id: C }, data: { inRoster: false } });
    expect(prismaMock.character.delete).not.toHaveBeenCalled();
  });

  test('keeps the history of an unclaimed slot that already has answers', async () => {
    prismaMock.character.findFirst.mockResolvedValue(stored());
    prismaMock.response.count.mockResolvedValue(3);
    prismaMock.character.update.mockResolvedValue({});

    await (await app()).inject({ method: 'DELETE', url: `/roster/${C}` });

    expect(prismaMock.character.delete).not.toHaveBeenCalled();
    expect(prismaMock.character.update).toHaveBeenCalledWith({ where: { id: C }, data: { inRoster: false } });
  });

  test('404 when it is not in the roster', async () => {
    prismaMock.character.findFirst.mockResolvedValue(null);
    expect((await (await app()).inject({ method: 'DELETE', url: `/roster/${C}` })).statusCode).toBe(404);
  });
});

describe('POST /roster/:id/release', () => {
  test('frees a claimed name so another player can take it', async () => {
    prismaMock.character.findFirst.mockResolvedValue(stored({ userId: 'u1' }));
    prismaMock.character.update.mockResolvedValue(stored());

    const res = await (await app()).inject({ method: 'POST', url: `/roster/${C}/release` });

    expect(res.statusCode).toBe(200);
    expect(prismaMock.character.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: C }, data: { userId: null, isMain: false } }),
    );
  });

  test('409 when nobody had claimed it', async () => {
    prismaMock.character.findFirst.mockResolvedValue(stored());
    expect((await (await app()).inject({ method: 'POST', url: `/roster/${C}/release` })).statusCode).toBe(409);
  });

  test('404 when it is not in the roster', async () => {
    prismaMock.character.findFirst.mockResolvedValue(null);
    expect((await (await app()).inject({ method: 'POST', url: `/roster/${C}/release` })).statusCode).toBe(404);
  });
});
