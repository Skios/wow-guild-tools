import { afterEach, describe, expect, test } from 'vitest';
import { formatStart, guildTimeZone } from './format-time.js';

const START = new Date('2026-10-18T19:00:00Z');
afterEach(() => { delete process.env.GUILD_TIME_ZONE; });

describe('formatStart', () => {
  test("the guild's local time, with the zone written out", () => {
    expect(formatStart(START, 'Europe/Rome')).toMatch(/Sun 18 Oct.*21:00.*(CEST|GMT\+2)/);
    expect(formatStart(START, 'UTC')).toMatch(/19:00.*UTC/);
  });

  test('GUILD_TIME_ZONE picks the zone; a wrong one falls back to Europe/Rome', () => {
    process.env.GUILD_TIME_ZONE = 'America/New_York';
    expect(guildTimeZone()).toBe('America/New_York');
    process.env.GUILD_TIME_ZONE = 'Mars/Olympus';
    expect(guildTimeZone()).toBe('Europe/Rome');
  });
});
