import { describe, expect, test } from 'vitest';
import {
  addCharacter, changedSelections, confirmRow, isDirty, rowsFromResponses, setStatus, sortRows, summarize,
  type RosterRow,
} from './roster';
import type { CharacterSummary, EventResponse } from './types';

const response = (name: string, role: RosterRow['role'], status: EventResponse['status'], isConfirmed = false): EventResponse => ({
  id: `r-${name}`,
  characterId: `c-${name}`,
  status,
  isConfirmed,
  character: { id: `c-${name}`, name, realm: 'Silvermoon', class: 'MAGE', role, isMain: true, user: { username: `${name}_player` } },
});

const candidate = (name: string, role: RosterRow['role'] = 'DPS'): CharacterSummary => ({
  id: `c-${name}`, userId: `u-${name}`, name, realm: 'Silvermoon', class: 'MAGE', role, isMain: true, username: `${name}_player`,
});

const rows = (...r: EventResponse[]) => rowsFromResponses(r);

describe('rowsFromResponses', () => {
  test('flattens responses into editable rows and remembers the saved state', () => {
    const [row] = rows(response('Amy', 'TANK', 'IN', true));

    expect(row).toMatchObject({
      characterId: 'c-Amy', name: 'Amy', realm: 'Silvermoon', role: 'TANK', username: 'Amy_player',
      status: 'IN', isConfirmed: true, saved: { status: 'IN', isConfirmed: true },
    });
  });

  test('copes with an empty list', () => {
    expect(rows()).toEqual([]);
  });
});

describe('sortRows', () => {
  test('orders tank, healer, melee, ranged, then by name, without mutating the input', () => {
    const input = rows(
      response('Zed', 'RANGED_DPS', 'IN'), response('Bob', 'DPS', 'IN'), response('Amy', 'DPS', 'IN'),
      response('Cleo', 'HEALER', 'IN'), response('Tom', 'TANK', 'IN'),
    );
    const before = input.map(r => r.name);

    expect(sortRows(input).map(r => r.name)).toEqual(['Tom', 'Cleo', 'Amy', 'Bob', 'Zed']);
    expect(input.map(r => r.name)).toEqual(before);
  });

  test('is accent-insensitive in practice: Élodie sorts next to E, not after Z', () => {
    const sorted = sortRows(rows(response('Zoe', 'DPS', 'IN'), response('Élodie', 'DPS', 'IN'), response('Abe', 'DPS', 'IN')));
    expect(sorted.map(r => r.name)).toEqual(['Abe', 'Élodie', 'Zoe']);
  });
});

describe('setStatus', () => {
  test('changes the status', () => {
    const [row] = rows(response('Amy', 'DPS', 'OUT'));
    expect(setStatus(row!, 'IN').status).toBe('IN');
  });

  test.each(['OUT', 'TENTATIVE', 'BENCH'] as const)('moving a confirmed player to %s removes the confirmation', (status) => {
    const [row] = rows(response('Amy', 'DPS', 'IN', true));
    const next = setStatus(row!, status);
    expect(next.status).toBe(status);
    expect(next.isConfirmed).toBe(false);
  });

  test('is immutable', () => {
    const [row] = rows(response('Amy', 'DPS', 'IN', true));
    const snapshot = JSON.stringify(row);
    setStatus(row!, 'OUT');
    expect(JSON.stringify(row)).toBe(snapshot);
  });
});

describe('confirmRow', () => {
  test('confirming a player who answered OUT or TENTATIVE also moves them to IN', () => {
    for (const status of ['OUT', 'TENTATIVE', 'BENCH'] as const) {
      const [row] = rows(response('Amy', 'DPS', status));
      expect(confirmRow(row!, true)).toMatchObject({ status: 'IN', isConfirmed: true });
    }
  });

  test('un-confirming keeps the player IN', () => {
    const [row] = rows(response('Amy', 'DPS', 'IN', true));
    expect(confirmRow(row!, false)).toMatchObject({ status: 'IN', isConfirmed: false });
  });
});

describe('addCharacter', () => {
  test('adds an unsaved IN row for a character who never answered', () => {
    const next = addCharacter([], candidate('Amy'));

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ characterId: 'c-Amy', status: 'IN', isConfirmed: false, saved: null });
  });

  test('ignores a character who is already on the list', () => {
    const existing = rows(response('Amy', 'DPS', 'OUT'));
    expect(addCharacter(existing, candidate('Amy'))).toBe(existing);
  });
});

describe('changedSelections / isDirty', () => {
  test('nothing changed, nothing to save', () => {
    const list = rows(response('Amy', 'DPS', 'IN'));
    expect(changedSelections(list)).toEqual([]);
    expect(isDirty(list)).toBe(false);
  });

  test('only changed rows are sent, in the format the API expects', () => {
    const list = rows(response('Amy', 'DPS', 'IN'), response('Bob', 'DPS', 'OUT'));
    const edited = [confirmRow(list[0]!, true), list[1]!];

    expect(changedSelections(edited)).toEqual([{ characterId: 'c-Amy', status: 'IN', isConfirmed: true }]);
    expect(isDirty(edited)).toBe(true);
  });

  test('a new row is always sent', () => {
    const list = addCharacter([], candidate('Amy'));
    expect(changedSelections(list)).toEqual([{ characterId: 'c-Amy', status: 'IN', isConfirmed: false }]);
  });

  test('changing a value and changing it back is not a change', () => {
    const [row] = rows(response('Amy', 'DPS', 'IN'));
    const back = setStatus(setStatus(row!, 'OUT'), 'IN');
    expect(isDirty([back])).toBe(false);
  });
});

describe('summarize', () => {
  test('counts confirmed players per role and answers per status', () => {
    const summary = summarize(rows(
      response('T1', 'TANK', 'IN', true), response('T2', 'TANK', 'IN', false),
      response('H1', 'HEALER', 'IN', true),
      response('D1', 'DPS', 'IN', true), response('D2', 'DPS', 'OUT'),
      response('R1', 'RANGED_DPS', 'IN', true), response('R2', 'RANGED_DPS', 'TENTATIVE'),
      response('B1', 'DPS', 'BENCH'),
    ));

    expect(summary.confirmed).toBe(4 + 0);
    expect(summary.byRole).toEqual({ TANK: 1, HEALER: 1, DPS: 1, RANGED_DPS: 1 });
    expect(summary.byStatus).toEqual({ IN: 5, OUT: 1, TENTATIVE: 1, BENCH: 1 });
  });

  test('an empty roster has zeros everywhere', () => {
    expect(summarize([])).toEqual({
      confirmed: 0,
      byRole: { TANK: 0, HEALER: 0, DPS: 0, RANGED_DPS: 0 },
      byStatus: { IN: 0, OUT: 0, TENTATIVE: 0, BENCH: 0 },
    });
  });
});
