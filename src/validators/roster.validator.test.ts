import { describe, expect, test } from 'vitest';
import { RosterEntrySchema, RosterIdParamsSchema } from './roster.validator.js';

const entry = { name: 'Brannock', realm: 'Silvermoon', class: 'WARRIOR', spec: 'PROTECTION' };

describe('RosterEntrySchema', () => {
  test('accepts a character and derives the role from the spec', () => {
    expect(RosterEntrySchema.parse(entry)).toEqual({ ...entry, role: 'TANK', offSpecs: [], nickname: null });
  });

  test.each([
    ['MAGE', 'FIRE', 'RANGED_DPS'],
    ['HUNTER', 'SURVIVAL', 'DPS'],
    ['DEMONHUNTER', 'DEVOURER', 'RANGED_DPS'],
    ['DRUID', 'RESTORATION', 'HEALER'],
  ])('%s %s plays %s', (cls, spec, role) => {
    expect(RosterEntrySchema.parse({ ...entry, class: cls, spec }).role).toBe(role);
  });

  test('normalises the name capitalisation and trims the realm', () => {
    const parsed = RosterEntrySchema.parse({ ...entry, name: ' bRANNOCK ', realm: '  Silvermoon ' });
    expect(parsed.name).toBe('Brannock');
    expect(parsed.realm).toBe('Silvermoon');
  });

  test('ignores a role sent by the client: it always comes from the spec', () => {
    expect(RosterEntrySchema.parse({ ...entry, role: 'HEALER' }).role).toBe('TANK');
  });

  test.each([
    { class: 'MAGE', spec: 'PROTECTION' },
    { spec: 'FIRE' },
    { spec: 'protection' },
    { spec: '' },
    { class: 'NINJA' },
  ])('rejects the impossible combination %j and points at the spec', (patch) => {
    const result = RosterEntrySchema.safeParse({ ...entry, ...patch });
    expect(result.success).toBe(false);
  });

  test('the spec issue is reported on the spec field', () => {
    const result = RosterEntrySchema.safeParse({ ...entry, class: 'MAGE' });
    expect(result.error?.issues.some(i => i.path.join('.') === 'spec')).toBe(true);
  });

  test.each([{ name: 'X' }, { name: 'Thr4ll' }, { name: '' }, { realm: '' }, { realm: '<b>' }, { spec: undefined }, { class: undefined }])(
    'rejects %j',
    (patch) => {
      expect(RosterEntrySchema.safeParse({ ...entry, ...patch }).success).toBe(false);
    },
  );

  test.each([null, undefined, 'x', 5, []])('rejects the body %j', (body) => {
    expect(RosterEntrySchema.safeParse(body).success).toBe(false);
  });
});

describe('RosterIdParamsSchema', () => {
  test('needs a UUID', () => {
    expect(RosterIdParamsSchema.safeParse({ id: '3f2b8c1e-8a4d-4c55-9d7e-1b2c3d4e5f60' }).success).toBe(true);
    expect(RosterIdParamsSchema.safeParse({ id: 'nope' }).success).toBe(false);
  });
});

describe('RosterEntrySchema offspecs', () => {
  test('keeps the offspecs in the order given (2nd, 3rd...)', () => {
    const druid = { ...entry, class: 'DRUID', spec: 'RESTORATION', offSpecs: ['BALANCE', 'GUARDIAN', 'FERAL'] };
    expect(RosterEntrySchema.parse(druid).offSpecs).toEqual(['BALANCE', 'GUARDIAN', 'FERAL']);
  });

  test('every other spec of the class can be an offspec, no more', () => {
    expect(RosterEntrySchema.parse({ ...entry, offSpecs: ['ARMS', 'FURY'] }).offSpecs).toEqual(['ARMS', 'FURY']);
  });

  test.each([
    ['a spec of another class', ['HOLY']],
    ['the main spec again', ['PROTECTION']],
    ['the same offspec twice', ['ARMS', 'ARMS']],
    ['garbage', ['__proto__']],
    ['a non-string', [42]],
  ])('refuses %s', (_, offSpecs) => {
    const result = RosterEntrySchema.safeParse({ ...entry, offSpecs });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path[0]).toBe('offSpecs');
  });

  test('refuses more offspecs than the class has', () => {
    expect(RosterEntrySchema.safeParse({ ...entry, offSpecs: ['ARMS', 'FURY', 'ARMS', 'FURY'] }).success).toBe(false);
  });
});

describe('RosterEntrySchema nickname', () => {
  test.each([['Matte', 'Matte'], ['  Big Matte ', 'Big Matte'], ["D'Artagnan", "D'Artagnan"], ['Zoë_2', 'Zoë_2']])(
    'accepts %j as %j',
    (nickname, expected) => expect(RosterEntrySchema.parse({ ...entry, nickname }).nickname).toBe(expected),
  );

  test.each(['', '   ', null])('an empty nickname (%j) means none', (nickname) => {
    expect(RosterEntrySchema.parse({ ...entry, nickname }).nickname).toBeNull();
  });

  test.each(['x'.repeat(25), '<script>', 'a\nb', 'emoji 🐉'])('refuses %j', (nickname) => {
    const result = RosterEntrySchema.safeParse({ ...entry, nickname });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path[0]).toBe('nickname');
  });
});
