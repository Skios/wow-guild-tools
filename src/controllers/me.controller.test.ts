import { beforeEach, describe, expect, test, vi } from 'vitest';
import { buildRouteAppFor, uuid } from '../test/helpers.js';

const me = vi.hoisted(() => ({
  profile: vi.fn(), setNickname: vi.fn(), claimable: vi.fn(), claim: vi.fn(),
  addCharacter: vi.fn(), updateCharacter: vi.fn(), setMain: vi.fn(), removeCharacter: vi.fn(),
}));
const search = vi.hoisted(() => vi.fn());
vi.mock('../services/me.service.js', () => ({ MeService: class { constructor() { return me; } } }));
vi.mock('../services/character-search.service.js', () => ({ searchCharacters: search }));

import { meRoutes } from './me.controller.js';

const ME = uuid(1);
const C = uuid(4);
const app = () => buildRouteAppFor({ role: 'Raider', position: 40 }, meRoutes);
beforeEach(() => {
  Object.values(me).forEach(fn => fn.mockReset().mockResolvedValue(undefined));
  search.mockReset().mockResolvedValue([]);
});

describe('/me routes', () => {
  test('every route acts on the signed-in account, whatever the body says', async () => {
    const a = await app();
    me.profile.mockResolvedValue({ username: 'raider' });

    expect((await a.inject('/me/profile')).json()).toEqual({ username: 'raider' });
    expect((await a.inject({ method: 'PUT', url: '/me/profile', payload: { nickname: 'Matte', userId: 'someone-else' } })).statusCode).toBe(204);
    expect((await a.inject({ method: 'POST', url: '/me/characters', payload: { name: 'Thrall' } })).statusCode).toBe(201);
    expect((await a.inject({ method: 'POST', url: `/me/characters/${C}/claim` })).statusCode).toBe(200);
    expect((await a.inject({ method: 'PUT', url: `/me/characters/${C}`, payload: { spec: 'FURY' } })).statusCode).toBe(204);
    expect((await a.inject({ method: 'PUT', url: `/me/characters/${C}/main` })).statusCode).toBe(204);
    expect((await a.inject({ method: 'DELETE', url: `/me/characters/${C}` })).statusCode).toBe(204);

    expect(me.profile).toHaveBeenCalledWith(ME);
    expect(me.setNickname).toHaveBeenCalledWith(ME, 'Matte');
    expect(me.addCharacter).toHaveBeenCalledWith(ME, { name: 'Thrall' });
    expect(me.claim).toHaveBeenCalledWith(ME, C);
    expect(me.updateCharacter).toHaveBeenCalledWith(ME, C, { spec: 'FURY' });
    expect(me.setMain).toHaveBeenCalledWith(ME, C);
    expect(me.removeCharacter).toHaveBeenCalledWith(ME, C);
  });

  test('a bad character id is a 400', async () => {
    expect((await (await app()).inject({ method: 'DELETE', url: '/me/characters/nope' })).statusCode).toBe(400);
    expect(me.removeCharacter).not.toHaveBeenCalled();
  });

  test('search needs at least 2 characters', async () => {
    const a = await app();
    expect((await a.inject('/characters/search?q=u')).statusCode).toBe(400);
    expect((await a.inject('/characters/search?q=%20ulf%20')).statusCode).toBe(200);
    expect(search).toHaveBeenCalledWith('ulf');
  });
});
