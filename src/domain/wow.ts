import { WoWClass, WoWRole } from '@prisma/client';

export interface SpecInfo {
  id: string;
  label: string;
  role: WoWRole;
}

export interface ClassInfo {
  label: string;
  /** Official in-game class colour. */
  color: string;
  /** Roles at least one specialization of this class can fill (derived from SPECS). */
  roles: readonly WoWRole[];
}

/** Display order for rosters: tanks first, ranged last. */
export const ROLE_ORDER: Record<WoWRole, number> = { TANK: 0, HEALER: 1, DPS: 2, RANGED_DPS: 3 };

export const ROLE_LABEL: Record<WoWRole, string> = {
  TANK: 'Tank',
  HEALER: 'Healer',
  DPS: 'Melee DPS',
  RANGED_DPS: 'Ranged DPS',
};

const spec = (id: string, label: string, role: WoWRole): SpecInfo => ({ id, label, role });

// DPS means melee DPS; casters and ranged specs use RANGED_DPS.
export const SPECS: Record<WoWClass, readonly SpecInfo[]> = {
  WARRIOR: [spec('ARMS', 'Arms', 'DPS'), spec('FURY', 'Fury', 'DPS'), spec('PROTECTION', 'Protection', 'TANK')],
  PALADIN: [spec('HOLY', 'Holy', 'HEALER'), spec('PROTECTION', 'Protection', 'TANK'), spec('RETRIBUTION', 'Retribution', 'DPS')],
  HUNTER: [spec('BEAST_MASTERY', 'Beast Mastery', 'RANGED_DPS'), spec('MARKSMANSHIP', 'Marksmanship', 'RANGED_DPS'), spec('SURVIVAL', 'Survival', 'DPS')],
  ROGUE: [spec('ASSASSINATION', 'Assassination', 'DPS'), spec('OUTLAW', 'Outlaw', 'DPS'), spec('SUBTLETY', 'Subtlety', 'DPS')],
  PRIEST: [spec('DISCIPLINE', 'Discipline', 'HEALER'), spec('HOLY', 'Holy', 'HEALER'), spec('SHADOW', 'Shadow', 'RANGED_DPS')],
  DEATHKNIGHT: [spec('BLOOD', 'Blood', 'TANK'), spec('FROST', 'Frost', 'DPS'), spec('UNHOLY', 'Unholy', 'DPS')],
  SHAMAN: [spec('ELEMENTAL', 'Elemental', 'RANGED_DPS'), spec('ENHANCEMENT', 'Enhancement', 'DPS'), spec('RESTORATION', 'Restoration', 'HEALER')],
  MAGE: [spec('ARCANE', 'Arcane', 'RANGED_DPS'), spec('FIRE', 'Fire', 'RANGED_DPS'), spec('FROST', 'Frost', 'RANGED_DPS')],
  WARLOCK: [spec('AFFLICTION', 'Affliction', 'RANGED_DPS'), spec('DEMONOLOGY', 'Demonology', 'RANGED_DPS'), spec('DESTRUCTION', 'Destruction', 'RANGED_DPS')],
  MONK: [spec('BREWMASTER', 'Brewmaster', 'TANK'), spec('MISTWEAVER', 'Mistweaver', 'HEALER'), spec('WINDWALKER', 'Windwalker', 'DPS')],
  DRUID: [spec('BALANCE', 'Balance', 'RANGED_DPS'), spec('FERAL', 'Feral', 'DPS'), spec('GUARDIAN', 'Guardian', 'TANK'), spec('RESTORATION', 'Restoration', 'HEALER')],
  DEMONHUNTER: [spec('HAVOC', 'Havoc', 'DPS'), spec('VENGEANCE', 'Vengeance', 'TANK'), spec('DEVOURER', 'Devourer', 'RANGED_DPS')],
  EVOKER: [spec('DEVASTATION', 'Devastation', 'RANGED_DPS'), spec('PRESERVATION', 'Preservation', 'HEALER'), spec('AUGMENTATION', 'Augmentation', 'RANGED_DPS')],
};

const rolesOf = (cls: WoWClass): readonly WoWRole[] =>
  [...new Set(SPECS[cls].map(s => s.role))].sort((a, b) => ROLE_ORDER[a] - ROLE_ORDER[b]);

const CLASS_BASE: Record<WoWClass, { label: string; color: string }> = {
  WARRIOR: { label: 'Warrior', color: '#C79C6E' },
  PALADIN: { label: 'Paladin', color: '#F58CBA' },
  HUNTER: { label: 'Hunter', color: '#ABD473' },
  ROGUE: { label: 'Rogue', color: '#FFF569' },
  PRIEST: { label: 'Priest', color: '#FFFFFF' },
  SHAMAN: { label: 'Shaman', color: '#0070DE' },
  MAGE: { label: 'Mage', color: '#40C7EB' },
  WARLOCK: { label: 'Warlock', color: '#8788EE' },
  DRUID: { label: 'Druid', color: '#FF7D0A' },
  DEATHKNIGHT: { label: 'Death Knight', color: '#C41F3B' },
  MONK: { label: 'Monk', color: '#00FF96' },
  EVOKER: { label: 'Evoker', color: '#33937F' },
  DEMONHUNTER: { label: 'Demon Hunter', color: '#A330C9' },
};

export const CLASS_INFO = Object.fromEntries(
  (Object.keys(CLASS_BASE) as WoWClass[]).map(cls => [cls, { ...CLASS_BASE[cls], roles: rolesOf(cls) }]),
) as Record<WoWClass, ClassInfo>;

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

function findSpec(cls: unknown, id: unknown): SpecInfo | undefined {
  if (!isClass(cls) || typeof id !== 'string') return undefined;
  return SPECS[cls].find(s => s.id === id);
}

export const isValidSpec = (cls: unknown, id: unknown) => findSpec(cls, id) !== undefined;

/** The role a spec plays, or undefined for an unknown pair. */
export const specRole = (cls: unknown, id: unknown): WoWRole | undefined => findSpec(cls, id)?.role;

/** Validates a class/spec pair; the role comes from the spec. */
export function parseClassSpec(cls: unknown, id: unknown): { class: WoWClass; spec: string; role: WoWRole } {
  if (!isClass(cls)) throw new Error(`Unknown class: ${String(cls)}`);
  const found = findSpec(cls, id);
  if (!found) throw new Error(`${String(id)} is not a ${CLASS_INFO[cls].label} specialization`);
  return { class: cls, spec: found.id, role: found.role };
}

/** File name (without extension) of the spec icon shipped with the admin site. */
export const specIcon = (cls: WoWClass, id: string) => `${cls.toLowerCase()}-${id.toLowerCase()}`;
