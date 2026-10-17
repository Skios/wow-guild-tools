import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import type { Api } from '../api';
import { ApiContext, MetaContext } from '../context';
import type { CharacterSummary, EventDetail, EventSummary, Meta } from '../types';

export const META: Meta = {
  classes: [
    { id: 'MAGE', label: 'Mage', color: '#40C7EB', roles: ['RANGED_DPS'] },
    { id: 'WARRIOR', label: 'Warrior', color: '#C79C6E', roles: ['TANK', 'DPS'] },
    { id: 'PRIEST', label: 'Priest', color: '#FFFFFF', roles: ['HEALER', 'RANGED_DPS'] },
    { id: 'ROGUE', label: 'Rogue', color: '#FFF569', roles: ['DPS'] },
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
    checkKey: vi.fn().mockResolvedValue({ ok: true }),
    getMeta: vi.fn().mockResolvedValue(META),
    listEvents: vi.fn().mockResolvedValue([]),
    getEvent: vi.fn(),
    createEvent: vi.fn().mockResolvedValue({}),
    saveRoster: vi.fn().mockResolvedValue({ success: true }),
    publish: vi.fn().mockResolvedValue({ success: true }),
    listCharacters: vi.fn().mockResolvedValue([]),
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
  id: `c-${name}`, userId: `u-${name}`, name, realm: 'Silvermoon', class: 'MAGE', role: 'RANGED_DPS',
  isMain: true, username: `${name.toLowerCase()}_player`, ...over,
});

export const eventSummary = (over: Partial<EventSummary> = {}): EventSummary => ({
  id: 'e1', title: 'Raid Night', startTime: '2099-10-18T19:00:00Z', endTime: '2099-10-18T22:00:00Z', description: null,
  isPublished: false, counts: { in: 5, out: 2, tentative: 1, bench: 1, confirmed: 3 }, ...over,
});

export const response = (
  name: string, role: CharacterSummary['role'], status: 'IN' | 'OUT' | 'TENTATIVE' | 'BENCH', isConfirmed = false, cls = 'MAGE',
) => ({
  id: `r-${name}`, characterId: `c-${name}`, status, isConfirmed,
  character: { id: `c-${name}`, name, realm: 'Silvermoon', class: cls, role, isMain: true, user: { username: `${name.toLowerCase()}_player` } },
});

export const eventDetail = (over: Partial<EventDetail> = {}): EventDetail => ({
  id: 'e1', title: 'Raid Night', startTime: '2099-10-18T19:00:00Z', endTime: '2099-10-18T22:00:00Z',
  description: 'Bring flasks', isPublished: false,
  responses: [
    response('Zed', 'RANGED_DPS', 'IN', true),
    response('Tom', 'TANK', 'IN', true, 'WARRIOR'),
    response('Cleo', 'HEALER', 'TENTATIVE', false, 'PRIEST'),
    response('Rex', 'DPS', 'OUT', false, 'ROGUE'),
  ],
  ...over,
});
