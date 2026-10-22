import { describe, expect, test } from 'vitest';
import { CAPABILITIES, ROLE_CAPABILITIES, capabilitiesOf, parseRole } from './roles.js';

describe('roles', () => {
  test('the Owner has every capability', () => {
    expect(capabilitiesOf('OWNER')).toEqual([...CAPABILITIES]);
  });

  test('an Officer runs raids, roster and messages, but is not an admin', () => {
    expect(capabilitiesOf('OFFICER')).toEqual(['roster.manage', 'events.manage', 'messages.send']);
    expect(capabilitiesOf('OFFICER')).not.toContain('admin');
  });

  test('every role only lists known capabilities', () => {
    for (const caps of Object.values(ROLE_CAPABILITIES)) {
      for (const cap of caps) expect(CAPABILITIES).toContain(cap);
    }
  });

  test('a user without a role has no capability (no site access)', () => {
    expect(capabilitiesOf(null)).toEqual([]);
  });

  test.each([['owner', 'OWNER'], [' Officer ', 'OFFICER'], ['OFFICER', 'OFFICER']])('parses %j', (raw, role) => {
    expect(parseRole(raw)).toBe(role);
  });

  test.each(['', 'admin', 'raider', undefined, 3])('refuses %j', (raw) => {
    expect(() => parseRole(raw)).toThrow(/role/i);
  });

});
