import { describe, expect, test } from 'vitest';
import { eventState } from './event-state.js';

const NOW = new Date('2026-10-24T20:00:00Z');
const at = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
const event = (over = {}) => ({ isPublished: false, canceledAt: null, startTime: at(2), endTime: at(5), ...over });

describe('eventState', () => {
  test.each([
    ['open', event(), 'OPEN'],
    ['published', event({ isPublished: true }), 'CLOSED'],
    ['started', event({ startTime: at(-1) }), 'STARTED'],
    ['published and started', event({ isPublished: true, startTime: at(-1) }), 'STARTED'],
    ['over', event({ startTime: at(-5), endTime: at(-2) }), 'ENDED'],
    ['cancelled, even once over', event({ canceledAt: at(-10), startTime: at(-5), endTime: at(-2) }), 'CANCELED'],
  ])('%s', (_label, e, state) => {
    expect(eventState(e, NOW)).toBe(state);
  });
});
