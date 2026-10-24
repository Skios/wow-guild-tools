import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import type { Api } from '../api';
import { ApiContext, MetaContext, OfficerContext } from '../context';
import type { EventDetail, EventResponse, EventSummary, Meta, NoAnswerEntry, Officer, RoleId } from '../types';

export const OFFICER: Officer = {
  userId: 'u1', username: 'cid', role: 'Officer', position: 20, isOwner: false, mustChangePassword: false,
  capabilities: ['accounts.manage', 'events.manage', 'messages.send', 'roster.approve', 'roster.manage'],
};

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
    me: vi.fn().mockResolvedValue(OFFICER),
    getMeta: vi.fn().mockResolvedValue(META),
    listEvents: vi.fn().mockResolvedValue([]),
    getEvent: vi.fn(),
    createEvent: vi.fn().mockResolvedValue({}),
    setReminders: vi.fn().mockResolvedValue([]),
    saveRoster: vi.fn().mockResolvedValue({ success: true }),
    publish: vi.fn().mockResolvedValue({ success: true }),
    message: vi.fn().mockResolvedValue({ results: [] }),
    listRoster: vi.fn().mockResolvedValue([]),
    addToRoster: vi.fn().mockResolvedValue({}),
    updateRosterEntry: vi.fn().mockResolvedValue({}),
    removeFromRoster: vi.fn().mockResolvedValue({ success: true }),
    releaseRosterEntry: vi.fn().mockResolvedValue({}),
    listUsers: vi.fn().mockResolvedValue([]),
    listRoles: vi.fn().mockResolvedValue([]),
    setUserRole: vi.fn().mockResolvedValue(undefined),
    roleCapabilities: vi.fn().mockResolvedValue([]),
    createRole: vi.fn().mockResolvedValue({}),
    updateRole: vi.fn().mockResolvedValue({}),
    deleteRole: vi.fn().mockResolvedValue(undefined),
    resetUserPassword: vi.fn().mockResolvedValue({ password: 'Temp-password-123' }),
    changePassword: vi.fn().mockResolvedValue(undefined),
    telegramStatus: vi.fn().mockResolvedValue({ linked: false }),
    telegramBotLink: vi.fn().mockResolvedValue({ url: 'https://t.me/guild_bot?start=lTOKEN' }),
    linkTelegram: vi.fn().mockResolvedValue(undefined),
    unlinkTelegram: vi.fn().mockResolvedValue(undefined),
    sendResetLink: vi.fn().mockResolvedValue(undefined),
    profile: vi.fn().mockResolvedValue({
      username: 'cid', nickname: null, role: 'Officer', preferredChannel: 'telegram', channels: { telegram: false }, characters: [],
    }),
    setNickname: vi.fn().mockResolvedValue(undefined),
    claimable: vi.fn().mockResolvedValue([]),
    claimCharacter: vi.fn().mockResolvedValue({}),
    addMyCharacter: vi.fn().mockResolvedValue({}),
    updateMyCharacter: vi.fn().mockResolvedValue(undefined),
    setMainCharacter: vi.fn().mockResolvedValue(undefined),
    removeMyCharacter: vi.fn().mockResolvedValue(undefined),
    searchCharacters: vi.fn().mockResolvedValue([]),
    rosterAccounts: vi.fn().mockResolvedValue([]),
    assignRosterOwner: vi.fn().mockResolvedValue({}),
    listPendingRoster: vi.fn().mockResolvedValue([]),
    approveRoster: vi.fn().mockResolvedValue(undefined),
    revokeRoster: vi.fn().mockResolvedValue(undefined),
    rejectPending: vi.fn().mockResolvedValue(undefined),
    newSeason: vi.fn().mockResolvedValue({ deleted: 0, removed: 0 }),
    ...overrides,
  } as unknown as Api;
}

export function renderWith(ui: ReactElement, api: Api = fakeApi(), meta: Meta = META, officer: Officer = OFFICER) {
  return render(
    <ApiContext.Provider value={api}>
      <OfficerContext.Provider value={officer}>
        <MetaContext.Provider value={meta}>{ui}</MetaContext.Provider>
      </OfficerContext.Provider>
    </ApiContext.Provider>,
  );
}

export const eventSummary = (over: Partial<EventSummary> = {}): EventSummary => ({
  id: 'e1', title: 'Raid Night', startTime: '2099-10-18T19:00:00Z', endTime: '2099-10-18T22:00:00Z', description: null,
  isPublished: false, counts: { in: 5, out: 2, tentative: 1, bench: 1, late: 0, confirmed: 3, noAnswer: 4 }, ...over,
});

export const response = (
  name: string, role: RoleId, status: EventResponse['status'], isConfirmed = false, cls = 'MAGE',
  arrivalTime: string | null = null,
): EventResponse => ({
  id: `r-${name}`, characterId: `c-${name}`, status, isConfirmed, arrivalTime, note: null,
  character: { id: `c-${name}`, name, realm: 'Silvermoon', class: cls, spec: null, role, isMain: true, user: { username: `${name.toLowerCase()}_player` }, offSpecs: [], nickname: null },
});

export const noAnswer = (name: string, over: Partial<NoAnswerEntry> = {}): NoAnswerEntry => ({
  id: `c-${name}`, name, realm: 'Silvermoon', class: 'MAGE', spec: 'FIRE', role: 'RANGED_DPS',
  username: `${name.toLowerCase()}_player`, offSpecs: [], nickname: null, reachable: true, ...over,
});

export const eventDetail = (over: Partial<EventDetail> = {}): EventDetail => ({
  id: 'e1', title: 'Raid Night', startTime: '2099-10-18T19:00:00Z', endTime: '2099-10-18T22:00:00Z',
  description: 'Bring flasks', isPublished: false, noAnswer: [], reminders: [],
  responses: [
    response('Zed', 'RANGED_DPS', 'IN', true),
    response('Tom', 'TANK', 'IN', true, 'WARRIOR'),
    response('Cleo', 'HEALER', 'TENTATIVE', false, 'PRIEST'),
    response('Rex', 'DPS', 'OUT', false, 'ROGUE'),
  ],
  ...over,
});
