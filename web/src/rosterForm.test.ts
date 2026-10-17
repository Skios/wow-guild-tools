import { describe, expect, test } from 'vitest';
import { validateRosterEntry, type RosterFormValues } from './rosterForm';
import { META } from './test/render';

const meta = {
  ...META,
  classes: META.classes.map(c => ({
    ...c,
    specs: c.id === 'MAGE' ? [{ id: 'FIRE', label: 'Fire', role: 'RANGED_DPS' as const }] : [{ id: 'ARMS', label: 'Arms', role: 'DPS' as const }],
  })),
};
const valid: RosterFormValues = { name: 'Jaina', realm: 'Silvermoon', class: 'MAGE', spec: 'FIRE' };
const check = (patch: Partial<RosterFormValues> = {}) => validateRosterEntry({ ...valid, ...patch }, meta);

describe('validateRosterEntry', () => {
  test('builds the payload, trimming the text', () => {
    expect(check({ name: '  Jaina ', realm: ' Silvermoon ' })).toEqual({
      errors: {},
      payload: { name: 'Jaina', realm: 'Silvermoon', class: 'MAGE', spec: 'FIRE' },
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
});
