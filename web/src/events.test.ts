import { describe, expect, test } from 'vitest';
import { orderEvents } from './events';
import { eventSummary } from './test/render';

const NOW = new Date('2026-10-17T12:00:00Z');
const ev = (id: string, start: string, end: string) => eventSummary({ id, startTime: start, endTime: end });

describe('orderEvents', () => {
  test('upcoming events come first, soonest first, then past events, most recent first', () => {
    const list = [
      ev('old', '2026-10-01T19:00:00Z', '2026-10-01T22:00:00Z'),
      ev('later', '2026-10-25T19:00:00Z', '2026-10-25T22:00:00Z'),
      ev('older', '2026-09-01T19:00:00Z', '2026-09-01T22:00:00Z'),
      ev('soon', '2026-10-18T19:00:00Z', '2026-10-18T22:00:00Z'),
    ];

    expect(orderEvents(list, NOW).map(e => e.id)).toEqual(['soon', 'later', 'old', 'older']);
  });

  test('an event that is running right now counts as upcoming', () => {
    const list = [ev('past', '2026-10-10T19:00:00Z', '2026-10-10T22:00:00Z'), ev('now', '2026-10-17T10:00:00Z', '2026-10-17T14:00:00Z')];
    expect(orderEvents(list, NOW).map(e => e.id)).toEqual(['now', 'past']);
  });

  test('handles an empty list and does not mutate the input', () => {
    expect(orderEvents([], NOW)).toEqual([]);
    const list = [ev('b', '2026-10-25T19:00:00Z', '2026-10-25T22:00:00Z'), ev('a', '2026-10-18T19:00:00Z', '2026-10-18T22:00:00Z')];
    orderEvents(list, NOW);
    expect(list.map(e => e.id)).toEqual(['b', 'a']);
  });

  test('an event with an unparseable date does not crash the sort', () => {
    const list = [ev('bad', 'nope', 'nope'), ev('ok', '2026-10-18T19:00:00Z', '2026-10-18T22:00:00Z')];
    expect(orderEvents(list, NOW).map(e => e.id)).toContain('bad');
  });
});
