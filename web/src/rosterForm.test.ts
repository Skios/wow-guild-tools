import { describe, expect, test } from 'vitest';
import { moveItem, validateRosterEntry, type RosterFormValues } from './rosterForm';
import { META } from './test/render';

const meta = {
  ...META,
  classes: META.classes.map(c => ({
    ...c,
    specs: c.id === 'MAGE' ? [{ id: 'FIRE', label: 'Fire', role: 'RANGED_DPS' as const }, { id: 'FROST', label: 'Frost', role: 'RANGED_DPS' as const }] : [{ id: 'ARMS', label: 'Arms', role: 'DPS' as const }],
  })),
};
const valid: RosterFormValues = { name: 'Jaina', realm: 'Silvermoon', class: 'MAGE', spec: 'FIRE', offSpecs: [], nickname: '' };
const check = (patch: Partial<RosterFormValues> = {}) => validateRosterEntry({ ...valid, ...patch }, meta);

describe('validateRosterEntry', () => {
  test('builds the payload, trimming the text', () => {
    expect(check({ name: '  Jaina ', realm: ' Silvermoon ' })).toEqual({
      errors: {},
      payload: { name: 'Jaina', realm: 'Silvermoon', class: 'MAGE', spec: 'FIRE', offSpecs: [], nickname: null },
    });
  });

  test.each(['', ' ', 'A', 'Abcdefghijklm', 'Thr4ll', 'Thrall Jr', '<b>', 'Thrall😀', "O'Neil"])('rejects the name %j', (name) => {
    expect(check({ name }).errors.name).toBeDefined();
    expect(check({ name }).payload).toBeNull();
  });

  test.each(['Élodie', 'Zoë', 'Ab', 'Abcdefghijkl'])('accepts the name %j', (name) => {
    expect(check({ name }).errors.name).toBeUndefined();
  });

  test.each(['', ' ', 'A', 'a'.repeat(41), '<script>', 'x😀', 'a\tb'])('rejects the realm %j', (realm) => {
    expect(check({ realm }).errors.realm).toBeDefined();
  });

  test.each(["Mal'Ganis", 'Tarren Mill', 'Aggra (Português)', 'Azjol-Nerub'])('accepts the realm %j', (realm) => {
    expect(check({ realm }).errors.realm).toBeUndefined();
  });

  test('a class must be chosen, and must exist', () => {
    expect(check({ class: '' }).errors.class).toBeDefined();
    expect(check({ class: 'NINJA' }).errors.class).toBeDefined();
  });

  test('the spec must belong to the chosen class', () => {
    expect(check({ spec: 'ARMS' }).errors.spec).toMatch(/Mage/);
    expect(check({ spec: '' }).errors.spec).toBeDefined();
  });

  test('with no class chosen, the spec error asks for the class first', () => {
    const result = check({ class: '', spec: '' });
    expect(result.errors.class).toBeDefined();
    expect(result.errors.spec).toBeUndefined();
  });

  test('reports every problem at once', () => {
    expect(Object.keys(check({ name: '', realm: '', class: 'MAGE', spec: 'ARMS' }).errors).sort()).toEqual(['name', 'realm', 'spec']);
  });

  test('sends the off-specs in order and the trimmed nickname', () => {
    expect(check({ offSpecs: ['FROST'], nickname: "  Matte-O'Neil_1. " }).payload).toMatchObject({ offSpecs: ['FROST'], nickname: "Matte-O'Neil_1." });
  });

  test.each(['', '   '])('a blank nickname %j means none', (nickname) => {
    expect(check({ nickname }).payload).toMatchObject({ nickname: null });
  });

  test.each(['a'.repeat(25), 'Matte!', '<b>', 'x😀', 'a\tb', 'a\nb'])('rejects the nickname %j', (nickname) => {
    expect(check({ nickname }).errors.nickname).toBeDefined();
    expect(check({ nickname }).payload).toBeNull();
  });

  test.each(['a', 'a'.repeat(24), 'Élodie Jr.', 'my_nick-2'])('accepts the nickname %j', (nickname) => {
    expect(check({ nickname }).errors.nickname).toBeUndefined();
  });

  test('the nickname limit counts after trimming', () => {
    expect(check({ nickname: ` ${'a'.repeat(24)} ` }).errors.nickname).toBeUndefined();
  });

  test.each([
    ['the main spec', ['FIRE']],
    ['a duplicate', ['FROST', 'FROST']],
    ['a spec of another class', ['ARMS']],
    ['an unknown spec', ['NOPE']],
    ['an empty id', ['']],
  ])('rejects %s as an off-spec', (_, offSpecs) => {
    expect(check({ offSpecs }).errors.offSpecs).toBeDefined();
    expect(check({ offSpecs }).payload).toBeNull();
  });

  test('off-specs are not judged before a class is chosen', () => {
    const result = check({ class: '', spec: '', offSpecs: ['FROST'] });
    expect(result.errors.offSpecs).toBeUndefined();
    expect(result.errors.class).toBeDefined();
  });

  test('does not hand the payload the form array itself', () => {
    const offSpecs = ['FROST'];
    expect(check({ offSpecs }).payload!.offSpecs).not.toBe(offSpecs);
  });
});

describe('moveItem', () => {
  test('swaps with the neighbour without mutating', () => {
    const list = ['a', 'b', 'c'];
    expect(moveItem(list, 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(list, 1, 1)).toEqual(['a', 'c', 'b']);
    expect(list).toEqual(['a', 'b', 'c']);
  });

  test('stays put at the ends', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});
