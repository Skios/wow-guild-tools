import { describe, expect, test } from 'vitest';
import {
  addCharacter, changedSelections, confirmRow, groupRows, isDirty, rowsFromResponses, setLateMinutes, setStatus, sortRows, summarize,
  type RosterRow,
} from './roster';
import type { EventResponse, NoAnswerEntry, ResponseStatus } from './types';

const START = '2026-10-18T19:00:00.000Z';

const response = (
  name: string, role: RosterRow['role'], status: ResponseStatus, isConfirmed = false, arrivalTime: string | null = null,
): EventResponse => ({
  id: `r-${name}`,
  note: null,
  characterId: `c-${name}`,
  status,
  isConfirmed,
  arrivalTime,
  character: { id: `c-${name}`, name, realm: 'Silvermoon', class: 'MAGE', spec: 'FIRE', role, isMain: true, user: { username: `${name}_player` }, offSpecs: [], nickname: null },
});

const noAnswer = (name: string): NoAnswerEntry => ({
  id: `c-${name}`, name, realm: 'Silvermoon', class: 'MAGE', spec: 'FIRE', role: 'RANGED_DPS', username: null, offSpecs: [], nickname: null, reachable: false,
});

const rows = (...r: EventResponse[]) => rowsFromResponses(r, START);

describe('rowsFromResponses', () => {
  test('flattens responses into editable rows and remembers the saved state', () => {
    const [row] = rows(response('Amy', 'TANK', 'IN', true));

    expect(row).toMatchObject({
      characterId: 'c-Amy', name: 'Amy', realm: 'Silvermoon', role: 'TANK', spec: 'FIRE', username: 'Amy_player',
      status: 'IN', isConfirmed: true, lateMinutes: null, saved: { status: 'IN', isConfirmed: true, lateMinutes: null },
    });
  });

  test('turns the stored arrival time back into minutes late', () => {
    const [row] = rows(response('Amy', 'DPS', 'LATE', true, '2026-10-18T19:15:00.000Z'));
    expect(row!.lateMinutes).toBe(15);
    expect(row!.saved!.lateMinutes).toBe(15);
  });

  test.each([['2026-10-18T18:00:00.000Z', 0], ['garbage', null]])('an odd arrival time %j becomes %j minutes', (arrival, expected) => {
    const [row] = rows(response('Amy', 'DPS', 'LATE', false, arrival));
    expect(row!.lateMinutes).toBe(expected);
  });

  test('a player with no linked account has no username', () => {
    const r = response('Ghost', 'DPS', 'IN');
    r.character.user = null;
    expect(rows(r)[0]!.username).toBeNull();
  });

  test('carries the off-specs and nickname', () => {
    const r = response('Amy', 'DPS', 'IN');
    r.character.offSpecs = ['FROST', 'ARCANE'];
    r.character.nickname = 'Matte';
    expect(rows(r)[0]).toMatchObject({ offSpecs: ['FROST', 'ARCANE'], nickname: 'Matte' });
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

  test('sorts accented names next to their plain letter', () => {
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
    expect(setStatus(row!, status)).toMatchObject({ status, isConfirmed: false });
  });

  test('IN to LATE keeps the confirmation: they are still coming', () => {
    const [row] = rows(response('Amy', 'DPS', 'IN', true));
    expect(setStatus(row!, 'LATE')).toMatchObject({ status: 'LATE', isConfirmed: true });
  });

  test('leaving LATE forgets the minutes; entering it starts without a delay', () => {
    const [late] = rows(response('Amy', 'DPS', 'LATE', true, '2026-10-18T19:30:00.000Z'));
    expect(setStatus(late!, 'IN').lateMinutes).toBeNull();
    expect(setStatus(setStatus(late!, 'IN'), 'LATE').lateMinutes).toBeNull();
  });

  test('is immutable', () => {
    const [row] = rows(response('Amy', 'DPS', 'IN', true));
    const snapshot = JSON.stringify(row);
    setStatus(row!, 'OUT');
    expect(JSON.stringify(row)).toBe(snapshot);
  });
});

describe('confirmRow', () => {
  test('confirming someone who said OUT, TENTATIVE or BENCH also moves them to IN', () => {
    for (const status of ['OUT', 'TENTATIVE', 'BENCH'] as const) {
      const [row] = rows(response('Amy', 'DPS', status));
      expect(confirmRow(row!, true)).toMatchObject({ status: 'IN', isConfirmed: true });
    }
  });

  test('confirming a late player keeps them LATE', () => {
    const [row] = rows(response('Amy', 'DPS', 'LATE'));
    expect(confirmRow(row!, true)).toMatchObject({ status: 'LATE', isConfirmed: true });
  });

  test('un-confirming keeps the answer', () => {
    const [row] = rows(response('Amy', 'DPS', 'IN', true));
    expect(confirmRow(row!, false)).toMatchObject({ status: 'IN', isConfirmed: false });
  });
});

describe('setLateMinutes', () => {
  test('sets the delay on a late player', () => {
    const [row] = rows(response('Amy', 'DPS', 'LATE'));
    expect(setLateMinutes(row!, 20).lateMinutes).toBe(20);
  });

  test.each([-5, 721, 1.5, Number.NaN])('ignores the impossible delay %s', (minutes) => {
    const [row] = rows(response('Amy', 'DPS', 'LATE', false, '2026-10-18T19:10:00.000Z'));
    expect(setLateMinutes(row!, minutes).lateMinutes).toBe(10);
  });

  test('null means "not sure how late"', () => {
    const [row] = rows(response('Amy', 'DPS', 'LATE', false, '2026-10-18T19:10:00.000Z'));
    expect(setLateMinutes(row!, null).lateMinutes).toBeNull();
  });

  test('does nothing for a player who is not late', () => {
    const [row] = rows(response('Amy', 'DPS', 'IN'));
    expect(setLateMinutes(row!, 20).lateMinutes).toBeNull();
  });
});

describe('addCharacter', () => {
  test('adds an unsaved IN row for a character who never answered', () => {
    const next = addCharacter([], noAnswer('Amy'));

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ characterId: 'c-Amy', status: 'IN', isConfirmed: false, saved: null });
  });

  test('can add them with another answer, e.g. when they told the officer they will be late', () => {
    expect(addCharacter([], noAnswer('Amy'), 'LATE')[0]).toMatchObject({ status: 'LATE', lateMinutes: null });
    expect(addCharacter([], noAnswer('Amy'), 'BENCH')[0]!.status).toBe('BENCH');
  });

  test('accepts a roster member who has not answered', () => {
    expect(addCharacter([], noAnswer('Amy'))[0]).toMatchObject({ characterId: 'c-Amy', username: null, role: 'RANGED_DPS' });
  });

  test('ignores a character who is already on the list', () => {
    const existing = rows(response('Amy', 'DPS', 'OUT'));
    expect(addCharacter(existing, noAnswer('Amy'))).toBe(existing);
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
    expect(changedSelections(addCharacter([], noAnswer('Amy')))).toEqual([{ characterId: 'c-Amy', status: 'IN', isConfirmed: false }]);
  });

  test('late minutes travel only with LATE, and a changed delay counts as a change', () => {
    const list = rows(response('Amy', 'DPS', 'LATE', true, '2026-10-18T19:10:00.000Z'));
    const edited = [setLateMinutes(list[0]!, 25)];

    expect(isDirty(edited)).toBe(true);
    expect(changedSelections(edited)).toEqual([{ characterId: 'c-Amy', status: 'LATE', isConfirmed: true, lateMinutes: 25 }]);
  });

  test('LATE with an unknown delay sends no minutes', () => {
    const added = addCharacter([], noAnswer('Amy'), 'LATE');
    expect(changedSelections(added)).toEqual([{ characterId: 'c-Amy', status: 'LATE', isConfirmed: false }]);
  });

  test('changing a value and changing it back is not a change', () => {
    const [row] = rows(response('Amy', 'DPS', 'IN'));
    expect(isDirty([setStatus(setStatus(row!, 'OUT'), 'IN')])).toBe(false);
  });
});

describe('summarize', () => {
  test('counts confirmed players per role and answers per status', () => {
    const summary = summarize(rows(
      response('T1', 'TANK', 'IN', true), response('T2', 'TANK', 'IN', false),
      response('H1', 'HEALER', 'IN', true),
      response('D1', 'DPS', 'IN', true), response('D2', 'DPS', 'OUT'),
      response('R1', 'RANGED_DPS', 'IN', true), response('R2', 'RANGED_DPS', 'TENTATIVE'),
      response('B1', 'DPS', 'BENCH'), response('L1', 'DPS', 'LATE', true),
    ));

    expect(summary.confirmed).toBe(5);
    expect(summary.byRole).toEqual({ TANK: 1, HEALER: 1, DPS: 2, RANGED_DPS: 1 });
    expect(summary.byStatus).toEqual({ IN: 5, OUT: 1, TENTATIVE: 1, BENCH: 1, LATE: 1 });
  });

  test('an empty roster has zeros everywhere', () => {
    expect(summarize([])).toEqual({
      confirmed: 0,
      byRole: { TANK: 0, HEALER: 0, DPS: 0, RANGED_DPS: 0 },
      byStatus: { IN: 0, OUT: 0, TENTATIVE: 0, BENCH: 0, LATE: 0 },
    });
  });
});

describe('groupRows', () => {
  const list = rows(
    response('Zed', 'RANGED_DPS', 'IN'), response('Tom', 'TANK', 'IN'), response('Cleo', 'HEALER', 'IN'), response('Bob', 'DPS', 'IN'),
    response('Amy', 'DPS', 'IN'),
    response('Late1', 'DPS', 'LATE', false, '2026-10-18T19:15:00.000Z'),
    response('Bench1', 'TANK', 'BENCH'), response('Tent1', 'HEALER', 'TENTATIVE'), response('Out1', 'DPS', 'OUT'),
  );
  const names = (rs: RosterRow[]) => rs.map(r => r.name);

  test('splits the IN players by role, each sorted by name', () => {
    const groups = groupRows(list);

    expect(names(groups.accepted.TANK)).toEqual(['Tom']);
    expect(names(groups.accepted.HEALER)).toEqual(['Cleo']);
    expect(names(groups.accepted.DPS)).toEqual(['Amy', 'Bob']);
    expect(names(groups.accepted.RANGED_DPS)).toEqual(['Zed']);
  });

  test('keeps late, bench, tentative and out apart from the accepted players', () => {
    const groups = groupRows(list);

    expect(names(groups.late)).toEqual(['Late1']);
    expect(names(groups.bench)).toEqual(['Bench1']);
    expect(names(groups.tentative)).toEqual(['Tent1']);
    expect(names(groups.out)).toEqual(['Out1']);
  });

  test('every row lands in exactly one group', () => {
    const groups = groupRows(list);
    const all = [
      ...Object.values(groups.accepted).flat(), ...groups.late, ...groups.bench, ...groups.tentative, ...groups.out,
    ];
    expect(all).toHaveLength(list.length);
  });

  test('an empty list gives empty groups', () => {
    const groups = groupRows([]);
    expect(Object.values(groups.accepted).every(g => g.length === 0)).toBe(true);
    expect(groups.late).toEqual([]);
  });
});

describe('notes', () => {
  test("a row carries the player's note; a row added on the board has none", () => {
    expect(rows({ ...response('Amy', 'DPS', 'IN'), note: 'early leave' })[0]!.note).toBe('early leave');
    expect(addCharacter([], noAnswer('Amy'))[0]!.note).toBeNull();
  });
});

describe('addCharacter off-specs and nickname', () => {
  test('copies them from a no-answer entry', () => {
    const entry = { ...noAnswer('Amy'), offSpecs: ['FROST'], nickname: 'Matte' };
    expect(addCharacter([], entry)[0]).toMatchObject({ offSpecs: ['FROST'], nickname: 'Matte' });
  });
});

describe('sendUnconfirmed', () => {
  test('moves IN/LATE players nobody confirmed to the bench (or out); the rest stay', async () => {
    const { sendUnconfirmed } = await import('./roster');
    const base = { characterId: '', name: '', realm: '', class: 'MAGE', spec: null, role: 'DPS' as const, username: null, offSpecs: [], nickname: null, lateMinutes: null, note: null, saved: null };
    const rows = [
      { ...base, characterId: 'a', status: 'IN' as const, isConfirmed: true },
      { ...base, characterId: 'b', status: 'LATE' as const, isConfirmed: false, lateMinutes: 15 },
      { ...base, characterId: 'c', status: 'TENTATIVE' as const, isConfirmed: false },
    ];

    expect(sendUnconfirmed(rows, 'OUT').map(r => [r.characterId, r.status])).toEqual([['a', 'IN'], ['b', 'OUT'], ['c', 'TENTATIVE']]);
    expect(sendUnconfirmed(rows, 'BENCH')[1]).toMatchObject({ status: 'BENCH', lateMinutes: null });
  });
});
