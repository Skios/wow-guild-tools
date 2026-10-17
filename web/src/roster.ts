import type { CharacterSummary, EventResponse, ResponseStatus, RoleId, RosterSelection } from './types';

export const ROLE_ORDER: Record<RoleId, number> = { TANK: 0, HEALER: 1, DPS: 2, RANGED_DPS: 3 };
export const STATUSES: ResponseStatus[] = ['IN', 'TENTATIVE', 'BENCH', 'OUT'];

interface SavedState {
  status: ResponseStatus;
  isConfirmed: boolean;
}

export interface RosterRow {
  characterId: string;
  name: string;
  realm: string;
  class: string;
  role: RoleId;
  username: string;
  status: ResponseStatus;
  isConfirmed: boolean;
  /** What the server has; null for a character added in this session. */
  saved: SavedState | null;
}

export function rowsFromResponses(responses: EventResponse[]): RosterRow[] {
  return responses.map(r => ({
    characterId: r.characterId,
    name: r.character.name,
    realm: r.character.realm,
    class: r.character.class,
    role: r.character.role,
    username: r.character.user.username,
    status: r.status,
    isConfirmed: r.isConfirmed,
    saved: { status: r.status, isConfirmed: r.isConfirmed },
  }));
}

export function sortRows(rows: RosterRow[]): RosterRow[] {
  return [...rows].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name));
}

/** Only players marked IN can be confirmed, so leaving IN drops the confirmation. */
export function setStatus(row: RosterRow, status: ResponseStatus): RosterRow {
  return { ...row, status, isConfirmed: status === 'IN' ? row.isConfirmed : false };
}

/** Confirming someone who said OUT/TENTATIVE/BENCH is the officer's call: they become IN. */
export function confirmRow(row: RosterRow, isConfirmed: boolean): RosterRow {
  return { ...row, status: isConfirmed ? 'IN' : row.status, isConfirmed };
}

export function addCharacter(rows: RosterRow[], character: CharacterSummary): RosterRow[] {
  if (rows.some(r => r.characterId === character.id)) return rows;
  const added: RosterRow = {
    characterId: character.id,
    name: character.name,
    realm: character.realm,
    class: character.class,
    role: character.role,
    username: character.username,
    status: 'IN',
    isConfirmed: false,
    saved: null,
  };
  return [...rows, added];
}

const isChanged = (row: RosterRow) =>
  !row.saved || row.saved.status !== row.status || row.saved.isConfirmed !== row.isConfirmed;

export function changedSelections(rows: RosterRow[]): RosterSelection[] {
  return rows.filter(isChanged).map(({ characterId, status, isConfirmed }) => ({ characterId, status, isConfirmed }));
}

export const isDirty = (rows: RosterRow[]) => rows.some(isChanged);

export interface RosterSummary {
  confirmed: number;
  byRole: Record<RoleId, number>;
  byStatus: Record<ResponseStatus, number>;
}

export function summarize(rows: RosterRow[]): RosterSummary {
  const summary: RosterSummary = {
    confirmed: 0,
    byRole: { TANK: 0, HEALER: 0, DPS: 0, RANGED_DPS: 0 },
    byStatus: { IN: 0, OUT: 0, TENTATIVE: 0, BENCH: 0 },
  };
  for (const row of rows) {
    summary.byStatus[row.status] += 1;
    if (row.isConfirmed) {
      summary.confirmed += 1;
      summary.byRole[row.role] += 1;
    }
  }
  return summary;
}
