import { describe, expect, test } from 'vitest';
import { CharacterNameSchema, CharacterSchema, RealmSchema, SetMainSchema } from './character.validator.js';

const uuid = '3f2b8c1e-8a4d-4c55-9d7e-1b2c3d4e5f60';

describe('CharacterNameSchema', () => {
  test.each(['Thrall', 'Ab', 'Abcdefghijkl', 'Ñandú', 'Élodie', 'Zoë', '  Thrall  '])('accepts %j', (name) => {
    expect(CharacterNameSchema.safeParse(name).success).toBe(true);
  });

  test('trims surrounding whitespace', () => {
    expect(CharacterNameSchema.parse('  Thrall ')).toBe('Thrall');
  });

  test.each([['thrall', 'Thrall'], ['THRALL', 'Thrall'], ['tHrAlL', 'Thrall'], ['élodie', 'Élodie'], ['ÉLODIE', 'Élodie']])(
    'normalises %j to the in-game capitalisation %j',
    (input, expected) => {
      expect(CharacterNameSchema.parse(input)).toBe(expected);
    },
  );

  test.each([
    '', ' ', 'A', 'Abcdefghijklm', 'Thr4ll', 'Thrall Jr', 'Thr_all', "O'Neil", '<b>Hi</b>', 'Thrall😀', '12345', 'Tha-ll',
    'a\nb', "Robert'); DROP TABLE characters;--",
  ])('rejects %j', (name) => {
    expect(CharacterNameSchema.safeParse(name).success).toBe(false);
  });

  test.each([undefined, null, 5, {}, []])('rejects the non-string %j', (name) => {
    expect(CharacterNameSchema.safeParse(name).success).toBe(false);
  });
});

describe('RealmSchema', () => {
  test.each(['Silvermoon', "Mal'Ganis", 'Tarren Mill', 'Aggra (Português)', 'Azjol-Nerub', "Quel'Thalas", 'Ab'])(
    'accepts %j',
    (realm) => {
      expect(RealmSchema.safeParse(realm).success).toBe(true);
    },
  );

  test.each(['', ' ', 'A', 'a'.repeat(41), '<script>', 'realm;DROP', 'a\tb', 'emoji😀', '   x   '])(
    'rejects %j',
    (realm) => {
      expect(RealmSchema.safeParse(realm).success).toBe(false);
    },
  );

  test('accepts exactly 40 characters', () => {
    expect(RealmSchema.safeParse('a'.repeat(40)).success).toBe(true);
  });
});

describe('CharacterSchema', () => {
  const valid = { userId: uuid, name: 'Thrall', realm: 'Silvermoon', class: 'SHAMAN', role: 'HEALER' };

  test('accepts a valid character', () => {
    expect(CharacterSchema.parse(valid)).toEqual(valid);
  });

  test.each([
    ['MAGE', 'TANK'],
    ['WARRIOR', 'HEALER'],
    ['ROGUE', 'RANGED_DPS'],
    ['HUNTER', 'TANK'],
  ])('rejects the impossible combination %s %s', (cls, role) => {
    const result = CharacterSchema.safeParse({ ...valid, class: cls, role });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['role']);
  });

  test('accepts the newer class and role values', () => {
    expect(CharacterSchema.safeParse({ ...valid, class: 'DEMONHUNTER', role: 'TANK' }).success).toBe(true);
    expect(CharacterSchema.safeParse({ ...valid, class: 'MAGE', role: 'RANGED_DPS' }).success).toBe(true);
  });

  test.each([{ class: 'NINJA' }, { class: 'warrior' }, { role: 'BARD' }, { userId: 'x' }, { name: 'X' }])(
    'rejects %j',
    (patch) => {
      expect(CharacterSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
    },
  );

  test('does not let the caller choose isMain', () => {
    expect(CharacterSchema.parse({ ...valid, isMain: true })).not.toHaveProperty('isMain');
  });
});

describe('SetMainSchema', () => {
  test('requires a UUID user id', () => {
    expect(SetMainSchema.safeParse({ userId: uuid }).success).toBe(true);
    expect(SetMainSchema.safeParse({ userId: 'abc' }).success).toBe(false);
    expect(SetMainSchema.safeParse({}).success).toBe(false);
    expect(SetMainSchema.safeParse(undefined).success).toBe(false);
  });
});
