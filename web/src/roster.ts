import type { CharacterSummary, EventResponse, NoAnswerEntry, ResponseStatus, RoleId, RosterSelection } from './types';

export const ROLE_ORDER: Record<RoleId, number> = { TANK: 0, HEALER: 1, DPS: 2, RANGED_DPS: 3 };
export const ROLES: RoleId[] = ['TANK', 'HEALER', 'DPS', 'RANGED_DPS'];
export const STATUSES: ResponseStatus[] = ['IN', 'LATE', 'TENTATIVE', 'BENCH', 'OUT'];
export const MAX_LATE_MINUTES = 720;

interface SavedState {
  status: ResponseStatus;
  isConfirmed: boolean;
  lateMinutes: number | null;
}

export interface RosterRow {
  characterId: string;
  name: string;
  realm: string;
  class: string;
  spec: string | null;
  role: RoleId;
  username: string | null;
  status: ResponseStatus;
  isConfirmed: boolean;
  /** Only meaningful while status is LATE; null = not said. */
  lateMinutes: number | null;
  /** What the server has; null for a character added in this session. */
  saved: SavedState | null;
}

/** IN and LATE both mean "coming"; only they can be confirmed for the raid. */
export const isAttending = (status: ResponseStatus) => status === 'IN' || status === 'LATE';

function minutesLate(arrivalTime: string | null, startTime: string): number | null {
  if (!arrivalTime) return null;
  const arrival = Date.parse(arrivalTime);
  const start = Date.parse(startTime);
  if (Number.isNaN(arrival) || Number.isNaN(start)) return null;
  return Math.max(0, Math.round((arrival - start) / 60_000));
}

export function rowsFromResponses(responses: EventResponse[], startTime: string): RosterRow[] {
  return responses.map(r => {
    const lateMinutes = minutesLate(r.arrivalTime, startTime);
    return {
      characterId: r.characterId,
      name: r.character.name,
      realm: r.character.realm,
      class: r.character.class,
      spec: r.character.spec,
      role: r.character.role,
      username: r.character.user?.username ?? null,
      status: r.status,
      isConfirmed: r.isConfirmed,
      lateMinutes,
      saved: { status: r.status, isConfirmed: r.isConfirmed, lateMinutes },
    };
  });
}

export function sortRows(rows: RosterRow[]): RosterRow[] {
  return [...rows].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name));
}

/** Only IN/LATE players can be confirmed, so moving elsewhere drops the confirmation. */
export function setStatus(row: RosterRow, status: ResponseStatus): RosterRow {
  return {
    ...row,
    status,
    isConfirmed: isAttending(status) ? row.isConfirmed : false,
    lateMinutes: status === 'LATE' && row.status === 'LATE' ? row.lateMinutes : null,
  };
}

/** Confirming someone who said OUT/TENTATIVE/BENCH is the officer's call: they become IN. */
export function confirmRow(row: RosterRow, isConfirmed: boolean): RosterRow {
  return { ...row, status: isConfirmed && !isAttending(row.status) ? 'IN' : row.status, isConfirmed };
}

export function setLateMinutes(row: RosterRow, minutes: number | null): RosterRow {
  if (row.status !== 'LATE') return row;
  if (minutes === null) return { ...row, lateMinutes: null };
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_LATE_MINUTES) return row;
  return { ...row, lateMinutes: minutes };
}

export function addCharacter(
  rows: RosterRow[],
  character: CharacterSummary | NoAnswerEntry,
  status: ResponseStatus = 'IN',
): RosterRow[] {
  if (rows.some(r => r.characterId === character.id)) return rows;
  const added: RosterRow = {
    characterId: character.id,
    name: character.name,
    realm: character.realm,
    class: character.class,
    spec: character.spec,
    role: character.role,
    username: character.username,
    status,
    isConfirmed: false,
    lateMinutes: null,
    saved: null,
  };
  return [...rows, added];
}

const isChanged = (row: RosterRow) =>
  !row.saved
  || row.saved.status !== row.status
  || row.saved.isConfirmed !== row.isConfirmed
  || row.saved.lateMinutes !== row.lateMinutes;

export function changedSelections(rows: RosterRow[]): RosterSelection[] {
  return rows.filter(isChanged).map(({ characterId, status, isConfirmed, lateMinutes }) => ({
    characterId,
    status,
    isConfirmed,
    ...(status === 'LATE' && lateMinutes !== null && { lateMinutes }),
  }));
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
    byStatus: { IN: 0, OUT: 0, TENTATIVE: 0, BENCH: 0, LATE: 0 },
  };
  for (const row of rows) {
    summary.byStatus[row.status] += 1;
    if (row.isConfirmed && isAttending(row.status)) {
      summary.confirmed += 1;
      summary.byRole[row.role] += 1;
    }
  }
  return summary;
}

export interface RosterGroups {
  accepted: Record<RoleId, RosterRow[]>;
  late: RosterRow[];
  bench: RosterRow[];
  tentative: RosterRow[];
  out: RosterRow[];
}

/** The sections of the event board: accepted players by role, then everyone else by answer. */
export function groupRows(rows: RosterRow[]): RosterGroups {
  const sorted = sortRows(rows);
  const where = (status: ResponseStatus) => sorted.filter(r => r.status === status);
  return {
    accepted: {
      TANK: where('IN').filter(r => r.role === 'TANK'),
      HEALER: where('IN').filter(r => r.role === 'HEALER'),
      DPS: where('IN').filter(r => r.role === 'DPS'),
      RANGED_DPS: where('IN').filter(r => r.role === 'RANGED_DPS'),
    },
    late: where('LATE'),
    bench: where('BENCH'),
    tentative: where('TENTATIVE'),
    out: where('OUT'),
  };
}
