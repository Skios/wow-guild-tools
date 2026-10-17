import { WoWClass, WoWRole } from '@prisma/client';

export interface ClassInfo {
  label: string;
  /** Official in-game class colour. */
  color: string;
  /** Roles at least one specialization of this class can fill. */
  roles: readonly WoWRole[];
}

// DPS means melee DPS; casters and ranged specs use RANGED_DPS.
export const CLASS_INFO: Record<WoWClass, ClassInfo> = {
  WARRIOR: { label: 'Warrior', color: '#C79C6E', roles: ['TANK', 'DPS'] },
  PALADIN: { label: 'Paladin', color: '#F58CBA', roles: ['TANK', 'HEALER', 'DPS'] },
  HUNTER: { label: 'Hunter', color: '#ABD473', roles: ['DPS', 'RANGED_DPS'] },
  ROGUE: { label: 'Rogue', color: '#FFF569', roles: ['DPS'] },
  PRIEST: { label: 'Priest', color: '#FFFFFF', roles: ['HEALER', 'RANGED_DPS'] },
  SHAMAN: { label: 'Shaman', color: '#0070DE', roles: ['HEALER', 'DPS', 'RANGED_DPS'] },
  MAGE: { label: 'Mage', color: '#40C7EB', roles: ['RANGED_DPS'] },
  WARLOCK: { label: 'Warlock', color: '#8788EE', roles: ['RANGED_DPS'] },
  DRUID: { label: 'Druid', color: '#FF7D0A', roles: ['TANK', 'HEALER', 'DPS', 'RANGED_DPS'] },
  DEATHKNIGHT: { label: 'Death Knight', color: '#C41F3B', roles: ['TANK', 'DPS'] },
  MONK: { label: 'Monk', color: '#00FF96', roles: ['TANK', 'HEALER', 'DPS'] },
  EVOKER: { label: 'Evoker', color: '#33937F', roles: ['HEALER', 'RANGED_DPS'] },
  DEMONHUNTER: { label: 'Demon Hunter', color: '#A330C9', roles: ['TANK', 'DPS'] },
};

export const ROLE_LABEL: Record<WoWRole, string> = {
  TANK: 'Tank',
  HEALER: 'Healer',
  DPS: 'Melee DPS',
  RANGED_DPS: 'Ranged DPS',
};

const isClass = (value: unknown): value is WoWClass =>
  typeof value === 'string' && Object.hasOwn(CLASS_INFO, value);

const isRole = (value: unknown): value is WoWRole =>
  typeof value === 'string' && Object.hasOwn(ROLE_LABEL, value);

export function rolesFor(cls: unknown): readonly WoWRole[] {
  return isClass(cls) ? CLASS_INFO[cls].roles : [];
}

export function isValidRole(cls: unknown, role: unknown): boolean {
  return isRole(role) && rolesFor(cls).includes(role);
}

/** Validates a class/role pair and throws a readable error if it cannot exist in game. */
export function parseClassRole(cls: unknown, role: unknown): { class: WoWClass; role: WoWRole } {
  if (!isClass(cls)) throw new Error(`Unknown class: ${String(cls)}`);
  if (!isRole(role)) throw new Error(`Unknown role: ${String(role)}`);
  if (!isValidRole(cls, role)) {
    throw new Error(`${CLASS_INFO[cls].label} cannot play ${ROLE_LABEL[role]}`);
  }
  return { class: cls, role };
}
