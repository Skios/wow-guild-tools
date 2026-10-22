import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

import { applyImport, findClass, findSpec, parseRosterCsv, planImport, raiderIoGuild, type GuildMember } from './roster-import.service.js';

beforeEach(() => resetPrismaMock());

describe('parseRosterCsv', () => {
  test('reads a semicolon file with Italian headers, any column order', () => {
    const rows = parseRosterCsv('Reame;Nome;Classe;Spec;Offspec;Nickname\nNemesis;Ulfgaar;Warrior;Protection;Fury/Arms;Matte\n');
    expect(rows).toEqual([{ line: 2, name: 'Ulfgaar', realm: 'Nemesis', class: 'Warrior', spec: 'Protection', offSpecs: ['Fury', 'Arms'], nickname: 'Matte' }]);
  });

  test('reads a comma file with English headers; empty optional cells are empty', () => {
    const rows = parseRosterCsv('name,class,spec,offspec,realm\r\nMosswhisper,Druid,Restoration,,\r\n');
    expect(rows).toEqual([{ line: 2, name: 'Mosswhisper', realm: '', class: 'Druid', spec: 'Restoration', offSpecs: [], nickname: '' }]);
  });

  test('skips blank lines and keeps the real line numbers for errors', () => {
    const rows = parseRosterCsv('Nome;Classe;Spec\n\nA;Mage;Fire\n   \nB;Mage;Frost\n');
    expect(rows.map(r => r.line)).toEqual([3, 5]);
  });

  test('strips quotes and a UTF-8 BOM (what Excel exports)', () => {
    const rows = parseRosterCsv('﻿"Nome";"Classe";"Spec"\n"Ulfgaar";"Warrior";"Protection"\n');
    expect(rows[0]).toMatchObject({ name: 'Ulfgaar', class: 'Warrior', spec: 'Protection' });
  });

  test('a quoted cell may contain the separator and doubled quotes (Excel export)', () => {
    const rows = parseRosterCsv('name,class,spec,offspec,nickname\nUlfgaar,Warrior,Protection,"Fury, Arms","The ""Wall"""\n');
    expect(rows[0]).toMatchObject({ offSpecs: ['Fury', 'Arms'], nickname: 'The "Wall"' });
  });

  test('a realm with an apostrophe survives', () => {
    expect(parseRosterCsv("Nome;Classe;Spec;Reame\nUlfgaar;Warrior;Protection;Pozzo dell'Eternità\n")[0]!.realm).toBe("Pozzo dell'Eternità");
  });

  test.each([
    ['no name column', 'Classe;Spec\nWarrior;Arms\n', /name/i],
    ['no class column', 'Nome;Spec\nA;Arms\n', /class/i],
    ['no spec column', 'Nome;Classe\nA;Warrior\n', /spec/i],
    ['an empty file', '', /empty/i],
    ['only a header', 'Nome;Classe;Spec\n', /no characters/i],
  ])('refuses %s', (_, text, message) => {
    expect(() => parseRosterCsv(text)).toThrow(message);
  });
});

describe('findClass / findSpec', () => {
  test.each([['Warrior', 'WARRIOR'], ['death knight', 'DEATHKNIGHT'], ['DK', 'DEATHKNIGHT'], ['Demon Hunter', 'DEMONHUNTER'], ['dh', 'DEMONHUNTER'], ['EVOKER', 'EVOKER']])(
    'class %j is %s', (raw, cls) => expect(findClass(raw)).toBe(cls),
  );

  test.each(['', 'Paladino', 'Knight'])('unknown class %j', (raw) => expect(findClass(raw)).toBeNull());

  test.each([['HUNTER', 'Beast Mastery', 'BEAST_MASTERY'], ['HUNTER', 'beastmastery', 'BEAST_MASTERY'], ['HUNTER', 'BM', 'BEAST_MASTERY'], ['PALADIN', 'Protection', 'PROTECTION'], ['WARRIOR', 'prot', 'PROTECTION']])(
    '%s spec %j is %s', (cls, raw, spec) => expect(findSpec(cls as never, raw)).toBe(spec),
  );

  test('a spec of another class is not found', () => {
    expect(findSpec('WARRIOR', 'Holy')).toBeNull();
  });
});

const member = (name: string, realm: string, cls = 'Warrior'): GuildMember => ({ name, realm, class: cls });

describe('planImport', () => {
  const guild = [member('Ulfgaar', "Pozzo dell'Eternità"), member('Mosswhisper', 'Nemesis', 'Druid'), member('Twin', 'Nemesis'), member('Twin', 'Draenor')];
  const csv = (body: string) => parseRosterCsv(`Nome;Classe;Spec;Offspec;Reame;Nickname\n${body}`);

  beforeEach(() => prismaMock.character.findMany.mockResolvedValue([]));

  test('completes a missing realm from the guild and builds a valid roster entry', async () => {
    const [row] = await planImport(csv('Ulfgaar;Warrior;Protection;Fury/Arms;;Matte\n'), guild);

    expect(row).toMatchObject({ line: 2, status: 'new', notes: ["realm from the guild: Pozzo dell'Eternità"] });
    expect(row!.entry).toEqual({ name: 'Ulfgaar', realm: "Pozzo dell'Eternità", class: 'WARRIOR', spec: 'PROTECTION', role: 'TANK', offSpecs: ['FURY', 'ARMS'], nickname: 'Matte' });
  });

  test('a realm in the file wins over the guild', async () => {
    const [row] = await planImport(csv('Ulfgaar;Warrior;Protection;;Nemesis;\n'), guild);
    expect(row!.entry?.realm).toBe('Nemesis');
  });

  test("the realm's spelling comes from the guild, so 'nemesis' does not create a second Nemesis", async () => {
    const [row] = await planImport(csv('Mosswhisper;Druid;Restoration;;nemesis;\n'), guild);
    expect(row!.entry?.realm).toBe('Nemesis');
  });

  test('a character a player already registered (not in the roster) is flagged: it will be promoted', async () => {
    prismaMock.character.findMany.mockResolvedValue([
      { name: 'Ulfgaar', realm: "Pozzo dell'Eternità", inRoster: false, user: { username: 'ulfie' } },
    ]);

    const [row] = await planImport(csv('Ulfgaar;Warrior;Protection;;;\n'), guild);

    expect(row!.status).toBe('new');
    expect(row!.notes).toContainEqual(expect.stringMatching(/registered by ulfie.*promoted/));
  });

  test('a name on two realms of the guild is not guessed', async () => {
    const [row] = await planImport(csv('Twin;Warrior;Arms;;;\n'), guild);
    expect(row).toMatchObject({ status: 'error', notes: [expect.stringMatching(/Nemesis.*Draenor|Draenor.*Nemesis/)] });
  });

  test('a name that is not in the guild needs its realm in the file', async () => {
    const [row] = await planImport(csv('Stranger;Mage;Fire;;;\n'), guild);
    expect(row).toMatchObject({ status: 'error', notes: [expect.stringMatching(/not in the guild/i)] });
  });

  test('warns when the guild knows the character with another class (often a typo)', async () => {
    const [row] = await planImport(csv('Mosswhisper;Mage;Fire;;;\n'), guild);
    expect(row!.status).toBe('new');
    expect(row!.notes).toContainEqual(expect.stringMatching(/Raider\.IO says Druid/));
  });

  test('matches guild names without caring about case', async () => {
    const [row] = await planImport(csv('ulfgaar;Warrior;Protection;;;\n'), guild);
    expect(row!.entry?.realm).toBe("Pozzo dell'Eternità");
  });

  test.each([
    ['an unknown class', 'A;Paladino;Holy;;Nemesis;', /class/i],
    ['a spec of another class', 'Aa;Warrior;Holy;;Nemesis;', /spec/i],
    ['an unknown offspec', 'Aa;Warrior;Arms;Holy;Nemesis;', /offspec/i],
    ['the main spec as offspec', 'Aa;Warrior;Arms;Arms;Nemesis;', /offspec/i],
    ['a bad character name', 'A1;Warrior;Arms;;Nemesis;', /name/i],
    ['a bad nickname', 'Aa;Warrior;Arms;;Nemesis;<b>', /nickname/i],
  ])('reports %s on its line', async (_, line, message) => {
    const [row] = await planImport(csv(`${line}\n`), guild);
    expect(row).toMatchObject({ line: 2, status: 'error', notes: [expect.stringMatching(message)] });
  });

  test('characters already in the roster are skipped, not duplicated', async () => {
    prismaMock.character.findMany.mockResolvedValue([{ name: 'Ulfgaar', realm: "Pozzo dell'Eternità", inRoster: true, user: null }]);

    const [row] = await planImport(csv('Ulfgaar;Warrior;Protection;;;\n'), guild);

    expect(row!.status).toBe('exists');
    expect(prismaMock.character.findMany).toHaveBeenCalledWith({
      select: { name: true, realm: true, inRoster: true, user: { select: { username: true } } },
    });
  });

  test('the same character twice in the file: the second is an error', async () => {
    const rows = await planImport(csv('Ulfgaar;Warrior;Protection;;;\nUlfgaar;Warrior;Arms;;;\n'), guild);
    expect(rows.map(r => r.status)).toEqual(['new', 'error']);
    expect(rows[1]!.notes[0]).toMatch(/line 2/);
  });

  test('works without guild data (realm must then be in the file)', async () => {
    const rows = await planImport(csv('Ulfgaar;Warrior;Protection;;Nemesis;\nOther;Mage;Fire;;;\n'), []);
    expect(rows.map(r => r.status)).toEqual(['new', 'error']);
  });
});

describe('applyImport', () => {
  test('adds only the new rows, one by one, and reports what happened', async () => {
    const add = vi.fn().mockResolvedValueOnce({ created: true }).mockRejectedValueOnce(new Error('db down'));
    const entry = { name: 'A', realm: 'R', class: 'MAGE', spec: 'FIRE', role: 'RANGED_DPS', offSpecs: [], nickname: null } as const;
    const plan = [
      { line: 2, status: 'new', notes: [], entry },
      { line: 3, status: 'exists', notes: [], entry },
      { line: 4, status: 'error', notes: ['x'] },
      { line: 5, status: 'new', notes: [], entry: { ...entry, name: 'B' } },
    ] as const;

    const result = await applyImport(plan as never, { add } as never);

    expect(add).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ added: 1, failed: [{ line: 5, error: 'db down' }] });
  });
});

describe('raiderIoGuild', () => {
  test('asks Raider.IO for the guild members and keeps name, realm and class', async () => {
    const body = { members: [{ rank: 5, character: { name: 'Ulfgaar', realm: "Pozzo dell'Eternità", class: 'Warrior', race: 'Orc' } }] };
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));

    await expect(raiderIoGuild({ region: 'eu', realm: 'Nemesis', name: 'Blaze of Glory' }, fetchImpl)).resolves.toEqual([
      { name: 'Ulfgaar', realm: "Pozzo dell'Eternità", class: 'Warrior' },
    ]);
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({ signal: expect.any(AbortSignal) });
    const url = new URL(fetchImpl.mock.calls[0]![0]);
    expect(url.origin + url.pathname).toBe('https://raider.io/api/v1/guilds/profile');
    expect(Object.fromEntries(url.searchParams)).toEqual({ region: 'eu', realm: 'Nemesis', name: 'Blaze of Glory', fields: 'members' });
  });

  test('a failed call says so (the import can still run with realms in the file)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 400 }));
    await expect(raiderIoGuild({ region: 'eu', realm: 'x', name: 'y' }, fetchImpl)).rejects.toThrow(/Raider\.IO.*400/);
  });

  test('ignores malformed members instead of crashing', async () => {
    const body = { members: [{ character: { name: 'Ok', realm: 'Nemesis', class: 'Mage' } }, { character: null }, { nope: 1 }] };
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    await expect(raiderIoGuild({ region: 'eu', realm: 'Nemesis', name: 'G' }, fetchImpl)).resolves.toHaveLength(1);
  });
});
