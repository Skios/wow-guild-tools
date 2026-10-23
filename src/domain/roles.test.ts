import { describe, expect, test } from 'vitest';
import { capabilitiesOf, knownCapabilities, registerCapability, roleChangeProblem, type SiteRole } from './roles.js';

const role = (name: string, position: number, capabilities: string[] = [], isOwner = false): SiteRole =>
  ({ name, position, capabilities, isOwner });
const OWNER = role('Owner', 0, [], true);
const GM = role('Guildmaster', 10, ['accounts.manage']);
const OFFICER = role('Officer', 20, ['accounts.manage', 'roster.manage']);
const RAIDLEADER = role('Raidleader', 30);
const RAIDER = role('Raider', 40);

describe('capabilities come from the code', () => {
  test('a route registering a capability makes it known, once, sorted', () => {
    registerCapability('zeta.test');
    registerCapability('alpha.test');
    registerCapability('alpha.test');
    const known = knownCapabilities();
    expect(known.filter(c => c === 'alpha.test')).toHaveLength(1);
    expect(known).toEqual([...known].sort());
  });

  test.each(['', 'admin', 'Roster.manage', 'roster manage', 'roster.', '.manage', 'roster.manage!'])('refuses the name %j', (name) => {
    expect(() => registerCapability(name)).toThrow(/capability/i);
  });

  test('the Owner has every known capability', () => {
    registerCapability('owner.test');
    expect(capabilitiesOf(OWNER)).toEqual(knownCapabilities());
  });

  test('other roles keep only the capabilities the code knows (a stale name grants nothing)', () => {
    registerCapability('roster.manage');
    expect(capabilitiesOf(role('X', 5, ['roster.manage', 'gone.away']))).toEqual(['roster.manage']);
  });
});

describe('roleChangeProblem', () => {
  const me = (r: SiteRole) => ({ userId: 'me', role: r });
  const them = (r: SiteRole | null) => ({ userId: 'them', role: r });

  test('nobody changes their own role, not even the Owner', () => {
    expect(roleChangeProblem(me(OWNER), { userId: 'me', role: OWNER }, GM)).toMatch(/own role/);
  });

  test('a role equal to yours can be given to someone below you', () => {
    expect(roleChangeProblem(me(OFFICER), them(RAIDER), OFFICER)).toBeNull();
    expect(roleChangeProblem(me(OFFICER), them(RAIDLEADER), RAIDER)).toBeNull();
    expect(roleChangeProblem(me(OFFICER), them(null), RAIDER)).toBeNull();
  });

  test('a role above yours cannot be given', () => {
    expect(roleChangeProblem(me(OFFICER), them(RAIDER), GM)).toMatch(/equal to or below/);
    expect(roleChangeProblem(me(GM), them(RAIDER), OWNER)).toMatch(/equal to or below/);
  });

  test('someone at your level or above cannot be changed', () => {
    expect(roleChangeProblem(me(OFFICER), them(OFFICER), RAIDER)).toMatch(/below you/);
    expect(roleChangeProblem(me(OFFICER), them(GM), RAIDER)).toMatch(/below you/);
    expect(roleChangeProblem(me(GM), them(OWNER), RAIDER)).toMatch(/below you/);
  });

  test('a lower role holding a capability you lack cannot be given (no handing out powers you lack)', () => {
    registerCapability('billing.manage');
    const treasurer = role('Treasurer', 50, ['billing.manage']);
    expect(roleChangeProblem(me(OFFICER), them(RAIDER), treasurer)).toMatch(/capabilities you have/);
    expect(roleChangeProblem(me(OWNER), them(RAIDER), treasurer)).toBeNull();
  });

  test('the Owner can change anyone else, other Owners included', () => {
    expect(roleChangeProblem(me(OWNER), them(OWNER), RAIDER)).toBeNull();
    expect(roleChangeProblem(me(OWNER), them(RAIDER), OWNER)).toBeNull();
  });
});
