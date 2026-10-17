import { WoWClass, WoWRole } from '@prisma/client';
import { describe, expect, test } from 'vitest';
import { CLASS_INFO, ROLE_LABEL, SPECS, isValidRole, isValidSpec, parseClassRole, parseClassSpec, rolesFor, specIcon } from './wow.js';

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
    ['DEMONHUNTER', 'RANGED_DPS', true], // Devourer
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

describe('specialization table', () => {
  const allSpecs = classes.flatMap(c => SPECS[c].map(spec => ({ cls: c, ...spec })));

  test('covers every class with 3 specs (Druid has 4): 40 in total', () => {
    expect(Object.keys(SPECS).sort()).toEqual([...classes].sort());
    expect(allSpecs).toHaveLength(40);
    expect(SPECS.DRUID).toHaveLength(4);
    for (const c of classes.filter(c => c !== 'DRUID')) expect(SPECS[c]).toHaveLength(3);
  });

  test('spec ids are unique inside a class (the same name may exist in different classes)', () => {
    for (const c of classes) {
      const ids = SPECS[c].map(s => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(SPECS.MAGE.some(s => s.id === 'FROST')).toBe(true);
    expect(SPECS.DEATHKNIGHT.some(s => s.id === 'FROST')).toBe(true);
  });

  test('has 6 tank and 7 healer specs, as in the game', () => {
    expect(allSpecs.filter(s => s.role === 'TANK')).toHaveLength(6);
    expect(allSpecs.filter(s => s.role === 'HEALER')).toHaveLength(7);
  });

  test.each([
    ['WARRIOR', 'ARMS', 'DPS'],
    ['WARRIOR', 'PROTECTION', 'TANK'],
    ['HUNTER', 'SURVIVAL', 'DPS'], // the only melee hunter spec
    ['HUNTER', 'MARKSMANSHIP', 'RANGED_DPS'],
    ['SHAMAN', 'ENHANCEMENT', 'DPS'],
    ['SHAMAN', 'ELEMENTAL', 'RANGED_DPS'],
    ['DRUID', 'FERAL', 'DPS'],
    ['DRUID', 'BALANCE', 'RANGED_DPS'],
    ['EVOKER', 'AUGMENTATION', 'RANGED_DPS'],
    ['PRIEST', 'DISCIPLINE', 'HEALER'],
    ['MONK', 'BREWMASTER', 'TANK'],
  ] as const)('%s %s is %s', (cls, spec, role) => {
    expect(parseClassSpec(cls, spec).role).toBe(role);
  });

  test('every class role is backed by at least one spec, and nothing else', () => {
    for (const c of classes) {
      expect([...CLASS_INFO[c].roles].sort()).toEqual([...new Set(SPECS[c].map(s => s.role))].sort());
    }
  });

  test('class roles are listed tank, healer, melee, ranged', () => {
    expect(CLASS_INFO.DRUID.roles).toEqual(['TANK', 'HEALER', 'DPS', 'RANGED_DPS']);
  });
});

describe('isValidSpec / parseClassSpec', () => {
  test('accepts a real spec and derives the role from it', () => {
    expect(isValidSpec('MAGE', 'FIRE')).toBe(true);
    expect(parseClassSpec('MAGE', 'FIRE')).toEqual({ class: 'MAGE', spec: 'FIRE', role: 'RANGED_DPS' });
  });

  test.each([['MAGE', 'ARMS'], ['WARRIOR', 'FIRE'], ['MAGE', 'fire'], ['MAGE', ''], ['NINJA', 'FIRE'], ['__proto__', 'FIRE'], ['MAGE', '__proto__'], ['MAGE', 'constructor']])(
    'rejects %j / %j',
    (cls, spec) => {
      expect(isValidSpec(cls, spec)).toBe(false);
      expect(() => parseClassSpec(cls, spec)).toThrow();
    },
  );

  test.each([undefined, null, 1, {}, []])('rejects the non-string spec %j', (spec) => {
    expect(isValidSpec('MAGE', spec)).toBe(false);
  });

  test('error messages name the class and the spec', () => {
    expect(() => parseClassSpec('MAGE', 'ARMS')).toThrow(/Mage.*Arms|Arms.*Mage/i);
    expect(() => parseClassSpec('NINJA', 'ARMS')).toThrow(/class/i);
  });
});

describe('specIcon', () => {
  test('builds a stable file slug', () => {
    expect(specIcon('DEATHKNIGHT', 'BLOOD')).toBe('deathknight-blood');
    expect(specIcon('HUNTER', 'BEAST_MASTERY')).toBe('hunter-beast_mastery');
  });
});
