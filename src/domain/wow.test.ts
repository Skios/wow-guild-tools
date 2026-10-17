import { WoWClass, WoWRole } from '@prisma/client';
import { describe, expect, test } from 'vitest';
import { CLASS_INFO, ROLE_LABEL, isValidRole, parseClassRole, rolesFor } from './wow.js';

const classes = Object.values(WoWClass);
const roles = Object.values(WoWRole);

describe('class table', () => {
  test('covers every class in the database enum, and nothing else', () => {
    expect(Object.keys(CLASS_INFO).sort()).toEqual([...classes].sort());
  });

  test.each(classes)('%s has a hex colour and a label', (cls) => {
    expect(CLASS_INFO[cls].color).toMatch(/^#[0-9A-F]{6}$/);
    expect(CLASS_INFO[cls].label.length).toBeGreaterThan(0);
  });

  test('uses the official class colours for a few well known classes', () => {
    expect(CLASS_INFO.SHAMAN.color).toBe('#0070DE');
    expect(CLASS_INFO.DEMONHUNTER.color).toBe('#A330C9');
    expect(CLASS_INFO.DEATHKNIGHT.color).toBe('#C41F3B');
  });

  test('no two classes share a colour', () => {
    const colours = classes.map(c => CLASS_INFO[c].color);
    expect(new Set(colours).size).toBe(colours.length);
  });

  test('labels are unique and human readable', () => {
    const labels = classes.map(c => CLASS_INFO[c].label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(CLASS_INFO.DEATHKNIGHT.label).toBe('Death Knight');
    expect(CLASS_INFO.DEMONHUNTER.label).toBe('Demon Hunter');
  });
});

describe('role table', () => {
  test('has a label for every role, with ranged DPS distinct from melee', () => {
    expect(Object.keys(ROLE_LABEL).sort()).toEqual([...roles].sort());
    expect(ROLE_LABEL.DPS).not.toBe(ROLE_LABEL.RANGED_DPS);
  });

  test('every role can be played by at least one class', () => {
    for (const role of roles) {
      expect(classes.some(c => isValidRole(c, role))).toBe(true);
    }
  });
});

describe('isValidRole', () => {
  test.each([
    ['WARRIOR', 'TANK', true],
    ['WARRIOR', 'HEALER', false],
    ['WARRIOR', 'RANGED_DPS', false],
    ['MAGE', 'RANGED_DPS', true],
    ['MAGE', 'TANK', false],
    ['MAGE', 'DPS', false],
    ['ROGUE', 'DPS', true],
    ['ROGUE', 'RANGED_DPS', false],
    ['PRIEST', 'HEALER', true],
    ['PRIEST', 'TANK', false],
    ['HUNTER', 'RANGED_DPS', true],
    ['HUNTER', 'DPS', true], // Survival is melee
    ['HUNTER', 'HEALER', false],
    ['EVOKER', 'HEALER', true],
    ['EVOKER', 'RANGED_DPS', true],
    ['EVOKER', 'TANK', false],
    ['DEMONHUNTER', 'TANK', true],
    ['DEMONHUNTER', 'HEALER', false],
    ['DRUID', 'TANK', true],
    ['DRUID', 'HEALER', true],
    ['DRUID', 'DPS', true],
    ['DRUID', 'RANGED_DPS', true],
    ['MONK', 'HEALER', true],
    ['PALADIN', 'RANGED_DPS', false],
    ['SHAMAN', 'TANK', false],
    ['WARLOCK', 'HEALER', false],
    ['DEATHKNIGHT', 'HEALER', false],
  ] as const)('%s as %s -> %s', (cls, role, expected) => {
    expect(isValidRole(cls, role)).toBe(expected);
  });

  test.each(['', 'NINJA', 'warrior', '__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
    'rejects the nonsense class %j without throwing',
    (cls) => {
      expect(isValidRole(cls, 'TANK')).toBe(false);
    },
  );

  test.each([undefined, null, 42, {}, [], 'tank', ''])('rejects the nonsense role %j', (role) => {
    expect(isValidRole('WARRIOR', role)).toBe(false);
  });
});

describe('rolesFor', () => {
  test('returns the allowed roles for a class and an empty list for unknown input', () => {
    expect(rolesFor('MAGE')).toEqual(['RANGED_DPS']);
    expect(rolesFor('NINJA')).toEqual([]);
    expect(rolesFor('__proto__')).toEqual([]);
  });
});

describe('parseClassRole', () => {
  test('accepts a valid pair', () => {
    expect(parseClassRole('SHAMAN', 'HEALER')).toEqual({ class: 'SHAMAN', role: 'HEALER' });
  });

  test('explains why an impossible pair is rejected', () => {
    expect(() => parseClassRole('MAGE', 'TANK')).toThrow(/Mage.*Tank/i);
  });

  test('rejects unknown values', () => {
    expect(() => parseClassRole('NINJA', 'TANK')).toThrow(/class/i);
    expect(() => parseClassRole('MAGE', 'BARD')).toThrow(/role/i);
  });
});
