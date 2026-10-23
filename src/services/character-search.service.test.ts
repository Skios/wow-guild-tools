import { beforeEach, describe, expect, test, vi } from 'vitest';
import { raiderIoSearch, searchCharacters } from './character-search.service.js';

const searchBody = {
  matches: [
    { type: 'character', name: 'Ulfgaar', data: { name: 'Ulfgaar', region: { slug: 'eu' }, realm: { name: "Pozzo dell'Eternità" }, class: { name: 'Warrior' } } },
    { type: 'character', name: 'Ulfgaar', data: { name: 'Ulfgaar', region: { slug: 'us' }, realm: { name: 'Area 52' }, class: { name: 'Hunter' } } },
    { type: 'guild', name: 'Ulf Guild', data: {} },
    { type: 'character', data: null },
  ],
};
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('raiderIoSearch', () => {
  test('keeps EU characters with name, realm and class id, with a timeout', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(searchBody));

    await expect(raiderIoSearch('Ulf', fetchImpl)).resolves.toEqual([{ name: 'Ulfgaar', realm: "Pozzo dell'Eternità", class: 'WARRIOR' }]);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://raider.io/api/search?term=Ulf');
    expect(init).toMatchObject({ signal: expect.any(AbortSignal) });
  });

  test('a failure is an error the caller can ignore', async () => {
    await expect(raiderIoSearch('x', vi.fn().mockResolvedValue(new Response('', { status: 500 })))).rejects.toThrow(/500/);
  });
});

describe('searchCharacters', () => {
  const guild = vi.fn();
  const search = vi.fn();
  beforeEach(() => {
    guild.mockReset().mockResolvedValue([
      { name: 'Ulfgaar', realm: "Pozzo dell'Eternità", class: 'Warrior' },
      { name: 'Ulrich', realm: 'Nemesis', class: 'Death Knight' },
      { name: 'Brannock', realm: 'Nemesis', class: 'Paladin' },
    ]);
    search.mockReset().mockResolvedValue([
      { name: 'Ulfgaar', realm: "Pozzo dell'Eternità", class: 'WARRIOR' },
      { name: 'Ulfric', realm: 'Silvermoon', class: 'MAGE' },
    ]);
  });

  test('guild members first (by prefix), then Raider.IO, without duplicates', async () => {
    const found = await searchCharacters('ul', { guild, search });
    expect(found).toEqual([
      { name: 'Ulfgaar', realm: "Pozzo dell'Eternità", class: 'WARRIOR', inGuild: true },
      { name: 'Ulrich', realm: 'Nemesis', class: 'DEATHKNIGHT', inGuild: true },
      { name: 'Ulfric', realm: 'Silvermoon', class: 'MAGE', inGuild: false },
    ]);
  });

  test('if Raider.IO is down, the guild suggestions still come back; if both are, an empty list', async () => {
    search.mockRejectedValue(new Error('down'));
    expect(await searchCharacters('bran', { guild, search })).toEqual([{ name: 'Brannock', realm: 'Nemesis', class: 'PALADIN', inGuild: true }]);
    guild.mockRejectedValue(new Error('down'));
    expect(await searchCharacters('bran', { guild, search })).toEqual([]);
  });
});
