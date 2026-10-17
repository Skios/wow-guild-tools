import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import type { Api } from '../api';
import { ApiContext, MetaContext } from '../context';
import type { CharacterSummary, EventDetail, EventResponse, EventSummary, Meta, NoAnswerEntry } from '../types';

export const META: Meta = {
  classes: [
    {
      id: 'MAGE', label: 'Mage', color: '#40C7EB', roles: ['RANGED_DPS'],
      specs: [{ id: 'ARCANE', label: 'Arcane', role: 'RANGED_DPS' }, { id: 'FIRE', label: 'Fire', role: 'RANGED_DPS' }, { id: 'FROST', label: 'Frost', role: 'RANGED_DPS' }],
    },
    {
      id: 'WARRIOR', label: 'Warrior', color: '#C79C6E', roles: ['TANK', 'DPS'],
      specs: [{ id: 'ARMS', label: 'Arms', role: 'DPS' }, { id: 'FURY', label: 'Fury', role: 'DPS' }, { id: 'PROTECTION', label: 'Protection', role: 'TANK' }],
    },
    {
      id: 'PRIEST', label: 'Priest', color: '#FFFFFF', roles: ['HEALER', 'RANGED_DPS'],
      specs: [{ id: 'DISCIPLINE', label: 'Discipline', role: 'HEALER' }, { id: 'HOLY', label: 'Holy', role: 'HEALER' }, { id: 'SHADOW', label: 'Shadow', role: 'RANGED_DPS' }],
    },
    {
      id: 'ROGUE', label: 'Rogue', color: '#FFF569', roles: ['DPS'],
      specs: [{ id: 'ASSASSINATION', label: 'Assassination', role: 'DPS' }, { id: 'OUTLAW', label: 'Outlaw', role: 'DPS' }],
    },
  ],
  roles: [
    { id: 'TANK', label: 'Tank' },
    { id: 'HEALER', label: 'Healer' },
    { id: 'DPS', label: 'Melee DPS' },
    { id: 'RANGED_DPS', label: 'Ranged DPS' },
  ],
};

type Overrides = { [K in keyof Api]?: ReturnType<typeof vi.fn> };

/** An Api whose every method is a vi.fn() resolving to something harmless. */
export function fakeApi(overrides: Overrides = {}): Api {
  return {
    getMeta: vi.fn().mockResolvedValue(META),
    listEvents: vi.fn().mockResolvedValue([]),
    getEvent: vi.fn(),
    createEvent: vi.fn().mockResolvedValue({}),
    saveRoster: vi.fn().mockResolvedValue({ success: true }),
    publish: vi.fn().mockResolvedValue({ success: true }),
    listCharacters: vi.fn().mockResolvedValue([]),
    message: vi.fn().mockResolvedValue({ results: [] }),
    listRoster: vi.fn().mockResolvedValue([]),
    addToRoster: vi.fn().mockResolvedValue({}),
    updateRosterEntry: vi.fn().mockResolvedValue({}),
    removeFromRoster: vi.fn().mockResolvedValue({ success: true }),
    releaseRosterEntry: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as Api;
}

export function renderWith(ui: ReactElement, api: Api = fakeApi(), meta: Meta = META) {
  return render(
    <ApiContext.Provider value={api}>
      <MetaContext.Provider value={meta}>{ui}</MetaContext.Provider>
    </ApiContext.Provider>,
  );
}

export const character = (name: string, over: Partial<CharacterSummary> = {}): CharacterSummary => ({
  id: `c-${name}`, userId: `u-${name}`, name, realm: 'Silvermoon', class: 'MAGE', spec: 'FIRE', role: 'RANGED_DPS',
  isMain: true, username: `${name.toLowerCase()}_player`, ...over,
});

export const eventSummary = (over: Partial<EventSummary> = {}): EventSummary => ({
  id: 'e1', title: 'Raid Night', startTime: '2099-10-18T19:00:00Z', endTime: '2099-10-18T22:00:00Z', description: null,
  isPublished: false, counts: { in: 5, out: 2, tentative: 1, bench: 1, late: 0, confirmed: 3, noAnswer: 4 }, ...over,
});

export const response = (
  name: string, role: CharacterSummary['role'], status: EventResponse['status'], isConfirmed = false, cls = 'MAGE',
  arrivalTime: string | null = null,
): EventResponse => ({
  id: `r-${name}`, characterId: `c-${name}`, status, isConfirmed, arrivalTime,
  character: { id: `c-${name}`, name, realm: 'Silvermoon', class: cls, spec: null, role, isMain: true, user: { username: `${name.toLowerCase()}_player` } },
});

export const noAnswer = (name: string, over: Partial<NoAnswerEntry> = {}): NoAnswerEntry => ({
  id: `c-${name}`, name, realm: 'Silvermoon', class: 'MAGE', spec: 'FIRE', role: 'RANGED_DPS',
  username: `${name.toLowerCase()}_player`, reachable: true, ...over,
});

export const eventDetail = (over: Partial<EventDetail> = {}): EventDetail => ({
  id: 'e1', title: 'Raid Night', startTime: '2099-10-18T19:00:00Z', endTime: '2099-10-18T22:00:00Z',
  description: 'Bring flasks', isPublished: false, noAnswer: [],
  responses: [
    response('Zed', 'RANGED_DPS', 'IN', true),
    response('Tom', 'TANK', 'IN', true, 'WARRIOR'),
    response('Cleo', 'HEALER', 'TENTATIVE', false, 'PRIEST'),
    response('Rex', 'DPS', 'OUT', false, 'ROGUE'),
  ],
  ...over,
});
