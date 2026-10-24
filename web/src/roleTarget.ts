import { isAttending, type RoleOfSpec, type RosterRow } from './roster';
import type { RoleId } from './types';

// Mirrors src/validators/role-target.validator.ts (the API checks it).
export type RoleTarget =
  | { mode: 'flex'; tanks: number; healersPer5: number; meleeShare: number }
  | { mode: 'fixed'; size: number; tanks: number; healers: number; melee: number; ranged: number };

export type RoleCounts = Record<RoleId, number>;

/** Melee within a DPS total; ranged gets the rest. */
export function splitDps(dps: number, melee: number) {
  const m = Math.min(Math.max(0, Math.round(melee)), dps);
  return { melee: m, ranged: dps - m };
}

/** How many of each role the target asks for. Flex grows with the confirmed count. */
export function targetCounts(target: RoleTarget, confirmed: number): RoleCounts {
  if (target.mode === 'fixed') return { TANK: target.tanks, HEALER: target.healers, DPS: target.melee, RANGED_DPS: target.ranged };
  const healers = Math.round((confirmed * target.healersPer5) / 5);
  const dps = Math.max(0, confirmed - target.tanks - healers);
  const { melee, ranged } = splitDps(dps, (dps * target.meleeShare) / 100);
  return { TANK: target.tanks, HEALER: healers, DPS: melee, RANGED_DPS: ranged };
}

/**
 * For each role under target, who is coming and could play it with an off-spec, unless their own role is short too.
 * Returns character id -> roles they could cover.
 */
export function coverSuggestions(rows: RosterRow[], current: RoleCounts, target: RoleCounts, roleOf: RoleOfSpec): Map<string, RoleId[]> {
  const short = (role: RoleId) => current[role] < target[role];
  const result = new Map<string, RoleId[]>();
  for (const row of rows) {
    if (!isAttending(row.status) || short(row.role)) continue;
    const roles = [...new Set(row.offSpecs.map(spec => roleOf(row.class, spec)))]
      .filter((role): role is RoleId => role !== undefined && role !== row.role && short(role));
    if (roles.length > 0) result.set(row.characterId, roles);
  }
  return result;
}
