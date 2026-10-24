import { prisma } from '../config/db.js';
import { DEFAULT_ROLE_TARGET, RoleTargetSchema, type RoleTarget } from '../validators/role-target.validator.js';

// Guild-wide settings (the one-row-per-key `settings` table).
export const ROLE_TARGET_KEY = 'roleTarget';
export const SEASON_START_KEY = 'seasonStart';

/** A stored target, or the fallback if it's missing or no longer valid. */
export function readTarget(value: unknown, fallback: RoleTarget = DEFAULT_ROLE_TARGET): RoleTarget {
  const parsed = RoleTargetSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

export async function defaultRoleTarget(): Promise<RoleTarget> {
  const row = await prisma.setting.findUnique({ where: { key: ROLE_TARGET_KEY } });
  return readTarget(row?.value);
}

/** When the current season started (the last "New season"), or null before the first one. */
export async function seasonStart(): Promise<Date | null> {
  const row = await prisma.setting.findUnique({ where: { key: SEASON_START_KEY } });
  const at = typeof row?.value === 'string' ? new Date(row.value) : null;
  return at && !Number.isNaN(at.getTime()) ? at : null;
}
