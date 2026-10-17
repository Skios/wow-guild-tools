import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CreateEventSchema,
  EventIdSchema,
  FinalizeRosterSchema,
  ListEventsQuerySchema,
  MessageSchema,
} from './event.validator.js';

const uuid = (n: number) => `3f2b8c1e-8a4d-4c55-9d7e-${String(n).padStart(12, '0')}`;
const NOW = new Date('2026-10-17T12:00:00Z');
const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const validEvent = () => ({
  title: 'Mythic Raid',
  startTime: at(24),
  endTime: at(27),
  createdByUserId: uuid(1),
});

describe('CreateEventSchema', () => {
  test('accepts a normal event and keeps the optional description', () => {
    const parsed = CreateEventSchema.parse({ ...validEvent(), description: 'Bring flasks' });
    expect(parsed.description).toBe('Bring flasks');
  });

  test('trims the title', () => {
    expect(CreateEventSchema.parse({ ...validEvent(), title: '  Raid  ' }).title).toBe('Raid');
  });

  test.each(['', '   ', '\n\t'])('rejects the empty-looking title %j', (title) => {
    expect(CreateEventSchema.safeParse({ ...validEvent(), title }).success).toBe(false);
  });

  test('title: 100 characters is the limit', () => {
    expect(CreateEventSchema.safeParse({ ...validEvent(), title: 'a'.repeat(100) }).success).toBe(true);
    expect(CreateEventSchema.safeParse({ ...validEvent(), title: 'a'.repeat(101) }).success).toBe(false);
  });

  test('description: 1000 characters is the limit (Telegram messages are capped at 4096)', () => {
    expect(CreateEventSchema.safeParse({ ...validEvent(), description: 'a'.repeat(1000) }).success).toBe(true);
    expect(CreateEventSchema.safeParse({ ...validEvent(), description: 'a'.repeat(1001) }).success).toBe(false);
  });

  test('rejects an end time equal to or before the start', () => {
    expect(CreateEventSchema.safeParse({ ...validEvent(), endTime: at(24) }).success).toBe(false);
    expect(CreateEventSchema.safeParse({ ...validEvent(), endTime: at(23) }).success).toBe(false);
  });

  test('rejects an event that has already ended', () => {
    expect(CreateEventSchema.safeParse({ ...validEvent(), startTime: at(-5), endTime: at(-1) }).success).toBe(false);
  });

  test('allows an event that already started but has not ended', () => {
    expect(CreateEventSchema.safeParse({ ...validEvent(), startTime: at(-1), endTime: at(2) }).success).toBe(true);
  });

  test('rejects events longer than 24 hours', () => {
    expect(CreateEventSchema.safeParse({ ...validEvent(), startTime: at(1), endTime: at(25) }).success).toBe(true);
    expect(CreateEventSchema.safeParse({ ...validEvent(), startTime: at(1), endTime: at(25.01) }).success).toBe(false);
  });

  test('rejects an event more than a year away', () => {
    const start = at(24 * 400);
    expect(CreateEventSchema.safeParse({ ...validEvent(), startTime: start, endTime: at(24 * 400 + 2) }).success).toBe(false);
  });

  test('accepts timezone offsets', () => {
    const parsed = CreateEventSchema.safeParse({
      ...validEvent(),
      startTime: '2026-10-18T21:00:00+02:00',
      endTime: '2026-10-19T00:00:00+02:00',
    });
    expect(parsed.success).toBe(true);
  });

  test.each([
    '2026-02-30T10:00:00Z',
    '2026-13-01T10:00:00Z',
    '2026-10-18T25:00:00Z',
    '2026-10-18',
    'tomorrow',
    '',
    '2026-10-18T10:00:00', // no timezone: ambiguous
  ])('rejects the invalid date %j', (startTime) => {
    expect(CreateEventSchema.safeParse({ ...validEvent(), startTime }).success).toBe(false);
  });

  test.each([undefined, null, 42, true, {}, []])('rejects the non-string title %j', (title) => {
    expect(CreateEventSchema.safeParse({ ...validEvent(), title }).success).toBe(false);
  });

  test('the creator is optional: officers have no identity until the admin gets a login', () => {
    const { createdByUserId: _omit, ...withoutCreator } = validEvent();
    expect(CreateEventSchema.safeParse(withoutCreator).success).toBe(true);
  });

  test('rejects a malformed creator id', () => {
    expect(CreateEventSchema.safeParse({ ...validEvent(), createdByUserId: '1; DROP TABLE users' }).success).toBe(false);
  });

  test('ignores unknown fields instead of passing them to the database', () => {
    const parsed = CreateEventSchema.parse({ ...validEvent(), isPublished: true, id: 'x' });
    expect(parsed).not.toHaveProperty('isPublished');
    expect(parsed).not.toHaveProperty('id');
  });

  test('rejects a body that is not an object', () => {
    for (const body of [null, undefined, 'str', 42, []]) {
      expect(CreateEventSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe('FinalizeRosterSchema', () => {
  const row = (n: number, status = 'IN', isConfirmed = true) => ({ characterId: uuid(n), status, isConfirmed });

  test('accepts every status in the database enum', () => {
    for (const status of ['IN', 'OUT', 'TENTATIVE', 'BENCH', 'LATE']) {
      expect(FinalizeRosterSchema.safeParse({ selections: [row(1, status, false)] }).success).toBe(true);
    }
  });

  test('rejects statuses that are not in the database enum', () => {
    for (const status of ['confirmed', 'in', 'LATER', 'late', '', null]) {
      expect(FinalizeRosterSchema.safeParse({ selections: [row(1, status as string)] }).success).toBe(false);
    }
  });

  test('rejects an empty roster', () => {
    expect(FinalizeRosterSchema.safeParse({ selections: [] }).success).toBe(false);
  });

  test('rejects more than 100 selections', () => {
    const many = Array.from({ length: 101 }, (_, i) => row(i + 1, 'IN', false));
    expect(FinalizeRosterSchema.safeParse({ selections: many }).success).toBe(false);
    expect(FinalizeRosterSchema.safeParse({ selections: many.slice(0, 100) }).success).toBe(true);
  });

  test('rejects the same character twice', () => {
    const result = FinalizeRosterSchema.safeParse({ selections: [row(1), row(1, 'BENCH', false)] });
    expect(result.success).toBe(false);
  });

  test('a late player can be confirmed: they are coming, just not on time', () => {
    expect(FinalizeRosterSchema.safeParse({ selections: [row(1, 'LATE', true)] }).success).toBe(true);
  });

  test('late minutes: 0 to 720, whole numbers, only for LATE', () => {
    const late = (lateMinutes: unknown, status = 'LATE') => FinalizeRosterSchema.safeParse({ selections: [{ ...row(1, status, false), lateMinutes }] }).success;

    expect(late(0)).toBe(true);
    expect(late(15)).toBe(true);
    expect(late(720)).toBe(true);
    expect(late(721)).toBe(false);
    expect(late(-1)).toBe(false);
    expect(late(1.5)).toBe(false);
    expect(late('15')).toBe(false);
    expect(late(null)).toBe(false);
    expect(late(15, 'IN')).toBe(false);
  });

  test('only IN or LATE players can be confirmed', () => {
    for (const status of ['OUT', 'TENTATIVE', 'BENCH']) {
      expect(FinalizeRosterSchema.safeParse({ selections: [row(1, status, true)] }).success).toBe(false);
    }
  });

  test('rejects malformed character ids and non-boolean flags', () => {
    expect(FinalizeRosterSchema.safeParse({ selections: [{ characterId: 'nope', status: 'IN', isConfirmed: false }] }).success).toBe(false);
    expect(FinalizeRosterSchema.safeParse({ selections: [{ characterId: uuid(1), status: 'IN', isConfirmed: 'yes' }] }).success).toBe(false);
  });

  test('rejects a missing or non-array selections field', () => {
    for (const body of [{}, { selections: 'IN' }, { selections: null }, null]) {
      expect(FinalizeRosterSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe('EventIdSchema', () => {
  test.each(['', 'abc', '123', uuid(1) + 'x', ' ' + uuid(1), "' OR 1=1 --"])('rejects %j', (id) => {
    expect(EventIdSchema.safeParse(id).success).toBe(false);
  });

  test('accepts a UUID', () => {
    expect(EventIdSchema.safeParse(uuid(1)).success).toBe(true);
  });
});

describe('ListEventsQuerySchema', () => {
  test('defaults to 20 events from offset 0', () => {
    expect(ListEventsQuerySchema.parse({})).toEqual({ limit: 20, offset: 0 });
  });

  test('coerces numeric strings, as query strings are always strings', () => {
    expect(ListEventsQuerySchema.parse({ limit: '5', offset: '10' })).toEqual({ limit: 5, offset: 10 });
  });

  test.each([{ limit: '0' }, { limit: '101' }, { limit: '-1' }, { limit: '1.5' }, { limit: 'abc' }, { offset: '-1' }, { offset: 'x' }])(
    'rejects %j',
    (query) => {
      expect(ListEventsQuerySchema.safeParse(query).success).toBe(false);
    },
  );

  test('accepts the boundaries 1 and 100', () => {
    expect(ListEventsQuerySchema.safeParse({ limit: '1' }).success).toBe(true);
    expect(ListEventsQuerySchema.safeParse({ limit: '100' }).success).toBe(true);
  });
});

describe('MessageSchema', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => uuid(i + 1));

  test('needs at least one recipient; the text is optional', () => {
    expect(MessageSchema.safeParse({ characterIds: ids(1) }).success).toBe(true);
    expect(MessageSchema.safeParse({ characterIds: [] }).success).toBe(false);
    expect(MessageSchema.safeParse({}).success).toBe(false);
  });

  test('at most 100 recipients, each once', () => {
    expect(MessageSchema.safeParse({ characterIds: ids(100) }).success).toBe(true);
    expect(MessageSchema.safeParse({ characterIds: ids(101) }).success).toBe(false);
    expect(MessageSchema.safeParse({ characterIds: [uuid(1), uuid(1)] }).success).toBe(false);
  });

  test('recipients must be UUIDs', () => {
    expect(MessageSchema.safeParse({ characterIds: ['nope'] }).success).toBe(false);
  });

  test('custom text is trimmed and limited to 500 characters; blank text means "use the default"', () => {
    expect(MessageSchema.parse({ characterIds: ids(1), text: '  hi  ' }).text).toBe('hi');
    expect(MessageSchema.parse({ characterIds: ids(1), text: '   ' }).text).toBeUndefined();
    expect(MessageSchema.safeParse({ characterIds: ids(1), text: 'a'.repeat(500) }).success).toBe(true);
    expect(MessageSchema.safeParse({ characterIds: ids(1), text: 'a'.repeat(501) }).success).toBe(false);
  });

  test.each([5, null, {}, []])('rejects the non-string text %j', (text) => {
    expect(MessageSchema.safeParse({ characterIds: ids(1), text }).success).toBe(false);
  });
});
