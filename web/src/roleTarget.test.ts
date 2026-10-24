import { describe, expect, test } from 'vitest';
import { coverSuggestions, splitDps, targetCounts } from './roleTarget';
import type { RosterRow } from './roster';

describe('targetCounts', () => {
  test('flex follows the confirmed count: tanks fixed, healers per 5, the DPS split by the share', () => {
    expect(targetCounts({ mode: 'flex', tanks: 2, healersPer5: 1, meleeShare: 50 }, 20)).toEqual({ TANK: 2, HEALER: 4, DPS: 7, RANGED_DPS: 7 });
    expect(targetCounts({ mode: 'flex', tanks: 2, healersPer5: 1, meleeShare: 30 }, 18)).toEqual({ TANK: 2, HEALER: 4, DPS: 4, RANGED_DPS: 8 });
    expect(targetCounts({ mode: 'flex', tanks: 2, healersPer5: 1, meleeShare: 50 }, 0)).toEqual({ TANK: 2, HEALER: 0, DPS: 0, RANGED_DPS: 0 });
  });

  test('fixed is what was set', () => {
    expect(targetCounts({ mode: 'fixed', size: 20, tanks: 2, healers: 4, melee: 4, ranged: 10 }, 3)).toEqual({ TANK: 2, HEALER: 4, DPS: 4, RANGED_DPS: 10 });
  });
});

describe('splitDps', () => {
  test('moving melee moves ranged the other way, within the DPS total', () => {
    expect(splitDps(14, 4)).toEqual({ melee: 4, ranged: 10 });
    expect(splitDps(14, 20)).toEqual({ melee: 14, ranged: 0 });
    expect(splitDps(14, -3)).toEqual({ melee: 0, ranged: 14 });
  });
});

describe('coverSuggestions', () => {
  const row = (characterId: string, role: RosterRow['role'], offSpecs: string[], status: RosterRow['status'] = 'IN'): RosterRow => ({
    characterId, name: characterId, realm: '', class: 'PRIEST', spec: null, role, username: null, offSpecs, nickname: null,
    status, isConfirmed: true, lateMinutes: null, note: null, saved: null,
  });
  const roleOf = (_cls: string, spec: string) => ({ SHADOW: 'RANGED_DPS', HOLY: 'HEALER' } as const)[spec as 'SHADOW' | 'HOLY'];

  test('who is coming and has an off-spec for a role under target, unless their own role is short too', () => {
    const rows = [row('Fardina', 'HEALER', ['SHADOW']), row('Out', 'HEALER', ['SHADOW'], 'OUT'), row('Shady', 'RANGED_DPS', ['HOLY'])];
    const current = { TANK: 2, HEALER: 5, DPS: 4, RANGED_DPS: 6 };
    const target = { TANK: 2, HEALER: 4, DPS: 4, RANGED_DPS: 8 };

    expect(coverSuggestions(rows, current, target, roleOf)).toEqual(new Map([['Fardina', ['RANGED_DPS']]]));
  });

  test('nothing short, nothing suggested', () => {
    expect(coverSuggestions([row('Fardina', 'HEALER', ['SHADOW'])], { TANK: 2, HEALER: 4, DPS: 4, RANGED_DPS: 8 }, { TANK: 2, HEALER: 4, DPS: 4, RANGED_DPS: 8 }, roleOf).size).toBe(0);
  });
});
