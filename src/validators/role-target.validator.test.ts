import { describe, expect, test } from 'vitest';
import { DEFAULT_ROLE_TARGET, RoleTargetSchema } from './role-target.validator.js';

describe('RoleTargetSchema', () => {
  test('the guild default is flex: 2 tanks, 1 healer every 5, DPS half melee', () => {
    expect(DEFAULT_ROLE_TARGET).toEqual({ mode: 'flex', tanks: 2, healersPer5: 1, meleeShare: 50 });
    expect(RoleTargetSchema.parse(DEFAULT_ROLE_TARGET)).toEqual(DEFAULT_ROLE_TARGET);
  });

  test('fixed: melee + ranged must fill exactly the DPS left by tanks and healers', () => {
    const fixed = { mode: 'fixed', size: 20, tanks: 2, healers: 4, melee: 4, ranged: 10 };
    expect(RoleTargetSchema.parse(fixed)).toEqual(fixed);
    expect(RoleTargetSchema.safeParse({ ...fixed, ranged: 11 }).success).toBe(false);
    expect(RoleTargetSchema.safeParse({ ...fixed, tanks: 15, healers: 6, melee: 0, ranged: -1 }).success).toBe(false);
  });

  test.each([
    [{ mode: 'flex', tanks: 2, healersPer5: 1, meleeShare: 101 }],
    [{ mode: 'flex', tanks: -1, healersPer5: 1, meleeShare: 50 }],
    [{ mode: 'flex', tanks: 2, healersPer5: 0.3, meleeShare: 50 }],
    [{ mode: 'fixed', size: 0, tanks: 0, healers: 0, melee: 0, ranged: 0 }],
    [{ mode: 'other' }],
  ])('refuses %j', (target) => {
    expect(RoleTargetSchema.safeParse(target).success).toBe(false);
  });
});
