import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';
import { buildRouteApp, prismaError, uuid } from '../test/helpers.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

import { rosterApprovalRoutes, rosterRoutes } from './roster.controller.js';

const C = uuid(1);
const app = () => buildRouteApp(rosterRoutes, rosterApprovalRoutes);
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

describe('PUT /roster/:id/owner', () => {
  test('gives the character to an account (or frees it with null)', async () => {
    const U = uuid(9);
    prismaMock.character.findUnique.mockResolvedValueOnce(stored());
    prismaMock.character.findFirst.mockResolvedValueOnce(null);
    prismaMock.user.findUnique.mockResolvedValue({ id: U });
    prismaMock.character.update.mockResolvedValue(stored({ userId: U, user: { username: 'thrall', nickname: null } }));

    const res = await (await app()).inject({ method: 'PUT', url: `/roster/${C}/owner`, payload: { userId: U } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ claimed: true, username: 'thrall' });
  });

  test('a bad user id is a 400', async () => {
    const res = await (await app()).inject({ method: 'PUT', url: `/roster/${C}/owner`, payload: { userId: 'nope' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /roster/accounts', () => {
  test('lists accounts that can sign in (name and nickname only), to pick an owner', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'u1', username: 'mrcid', nickname: 'Matte' }]);

    const res = await (await app()).inject('/roster/accounts');

    expect(res.json()).toEqual([{ id: 'u1', username: 'mrcid', nickname: 'Matte' }]);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: { identities: { some: { platform: 'supabase' } } },
      select: { id: true, username: true, nickname: true },
      orderBy: { username: 'asc' },
    });
  });
});

describe('approval (roster.approve)', () => {
  const inject = async (method: 'GET' | 'POST' | 'DELETE', url: string) => (await app()).inject({ method, url });

  test('GET /roster/pending lists characters players added that are not on the roster yet', async () => {
    prismaMock.character.findMany.mockResolvedValue([stored({ inRoster: false, userId: 'u1', user: { username: 'aure', nickname: 'Matte' } })]);

    const res = await inject('GET', '/roster/pending');

    expect(res.json()).toEqual([expect.objectContaining({ name: 'Brannock', nickname: 'Matte', username: 'aure' })]);
    expect(prismaMock.character.findMany.mock.calls[0]![0].where).toEqual({ inRoster: false, userId: { not: null } });
  });

  test('POST /roster/:id/approve puts a pending character on the roster', async () => {
    prismaMock.character.updateMany.mockResolvedValue({ count: 1 });

    expect((await inject('POST', `/roster/${C}/approve`)).statusCode).toBe(200);
    expect(prismaMock.character.updateMany).toHaveBeenCalledWith({ where: { id: C, inRoster: false, userId: { not: null } }, data: { inRoster: true } });
  });

  test('POST /roster/:id/revoke takes an owned character off the roster; the player keeps it', async () => {
    prismaMock.character.updateMany.mockResolvedValue({ count: 1 });

    expect((await inject('POST', `/roster/${C}/revoke`)).statusCode).toBe(200);
    expect(prismaMock.character.updateMany).toHaveBeenCalledWith({ where: { id: C, inRoster: true, userId: { not: null } }, data: { inRoster: false } });
    // Its answers to coming, unpublished events go (else the player could answer twice); past ones stay.
    const { where } = prismaMock.response.deleteMany.mock.calls[0]![0];
    expect(where).toEqual({ characterId: C, event: { isPublished: false, startTime: { gt: expect.any(Date) } } });
  });

  test('approve / revoke of something not in that state is a 404', async () => {
    prismaMock.character.updateMany.mockResolvedValue({ count: 0 });
    expect((await inject('POST', `/roster/${C}/approve`)).statusCode).toBe(404);
    expect((await inject('POST', `/roster/${C}/revoke`)).statusCode).toBe(404);
  });

  test('DELETE /roster/:id/pending rejects: a character that never answered is deleted (only while still pending)', async () => {
    prismaMock.character.findFirst.mockResolvedValue({ id: C, userId: 'u1', isMain: false });
    prismaMock.character.deleteMany.mockResolvedValue({ count: 1 });

    expect((await inject('DELETE', `/roster/${C}/pending`)).statusCode).toBe(200);
    expect(prismaMock.character.deleteMany).toHaveBeenCalledWith({ where: { id: C, inRoster: false, userId: { not: null }, responses: { none: {} } } });
    expect(prismaMock.character.updateMany).not.toHaveBeenCalled();
  });

  test('a rejected character with history is unlinked instead; a rejected main hands main to the next', async () => {
    prismaMock.character.findFirst.mockResolvedValueOnce({ id: C, userId: 'u1', isMain: true }).mockResolvedValueOnce({ id: 'alt' });
    prismaMock.character.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.character.updateMany.mockResolvedValue({ count: 1 });

    expect((await inject('DELETE', `/roster/${C}/pending`)).statusCode).toBe(200);
    expect(prismaMock.character.updateMany).toHaveBeenCalledWith({ where: { id: C, inRoster: false, userId: { not: null } }, data: { userId: null, isMain: false } });
    expect(prismaMock.character.update).toHaveBeenCalledWith({ where: { id: 'alt' }, data: { isMain: true } });
  });

  test('approved by someone else meanwhile: the reject is a 404 and the character stays', async () => {
    prismaMock.character.findFirst.mockResolvedValue({ id: C, userId: 'u1', isMain: false });
    prismaMock.character.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.character.updateMany.mockResolvedValue({ count: 0 });

    expect((await inject('DELETE', `/roster/${C}/pending`)).statusCode).toBe(404);
  });

  test('rejecting something that is not pending is a 404, nothing removed', async () => {
    prismaMock.character.findFirst.mockResolvedValue(null);

    expect((await inject('DELETE', `/roster/${C}/pending`)).statusCode).toBe(404);
    expect(prismaMock.character.delete).not.toHaveBeenCalled();
  });
});

describe('POST /roster/new-season', () => {
  const post = async (payload: object) => (await app()).inject({ method: 'POST', url: '/roster/new-season', payload });

  test('empties the roster in one transaction: empty unclaimed slots go, everything else leaves the roster', async () => {
    prismaMock.$transaction.mockResolvedValue([{ count: 9 }, { count: 2 }, { count: 5 }]);

    const res = await post({ confirm: 'NEW SEASON' });

    expect(res.json()).toEqual({ deleted: 2, removed: 5 });
    expect(prismaMock.character.deleteMany).toHaveBeenCalledWith({ where: { inRoster: true, userId: null, responses: { none: {} } } });
    expect(prismaMock.character.updateMany).toHaveBeenCalledWith({ where: { inRoster: true }, data: { inRoster: false } });
    // The dashboard's "whole season" attendance starts here.
    expect(prismaMock.setting.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'seasonStart' } }));
    expect(prismaMock.response.deleteMany.mock.calls[0]![0].where).toEqual({
      character: { inRoster: true }, event: { isPublished: false, startTime: { gt: expect.any(Date) } },
    });
  });

  test('needs the typed confirmation', async () => {
    expect((await post({ confirm: 'new season' })).statusCode).toBe(400);
    expect((await post({})).statusCode).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
