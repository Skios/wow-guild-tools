import { describe, expect, test } from 'vitest';
import { arrivalTime, formatDateTime, formatRange, formatTime, localInputToIso, toLocalInput } from './format';

describe('formatDateTime', () => {
  test('formats an ISO date for people', () => {
    expect(formatDateTime('2026-10-18T21:30:00Z')).toMatch(/Sun.*18.*Oct.*21:30/);
  });

  test.each(['', 'garbage', '2026-13-45T00:00:00Z'])('shows a dash for the invalid date %j', (value) => {
    expect(formatDateTime(value)).toBe('—');
  });
});

describe('formatRange', () => {
  test('shows only the end time when the event ends the same day', () => {
    const text = formatRange('2026-10-18T19:00:00Z', '2026-10-18T22:00:00Z');
    expect(text).toMatch(/19:00.*22:00/);
    expect(text.match(/Oct/g)).toHaveLength(1);
  });

  test('shows both dates when the event crosses midnight', () => {
    const text = formatRange('2026-10-18T22:00:00Z', '2026-10-19T01:00:00Z');
    expect(text.match(/Oct/g)).toHaveLength(2);
  });

  test('degrades gracefully when a date is invalid', () => {
    expect(formatRange('nope', '2026-10-19T01:00:00Z')).toContain('—');
  });
});

describe('localInputToIso', () => {
  test('converts a datetime-local value to a UTC ISO string', () => {
    expect(localInputToIso('2026-10-18T21:00')).toBe('2026-10-18T21:00:00.000Z');
  });

  test.each(['', 'abc', '2026-02-30T10:00', '2026-10-18'])('returns null for %j', (value) => {
    expect(localInputToIso(value)).toBeNull();
  });
});

describe('toLocalInput', () => {
  test('rounds a date to the next full hour in datetime-local format', () => {
    expect(toLocalInput(new Date('2026-10-17T12:20:00Z'))).toBe('2026-10-17T13:00');
  });

  test('keeps a date that is already on the hour', () => {
    expect(toLocalInput(new Date('2026-10-17T12:00:00Z'))).toBe('2026-10-17T12:00');
  });

  test('adds hours', () => {
    expect(toLocalInput(new Date('2026-10-17T12:00:00Z'), 3)).toBe('2026-10-17T15:00');
  });
});

describe('formatTime / arrivalTime', () => {
  test('formats just the time of day', () => {
    expect(formatTime('2026-10-18T21:15:00Z')).toBe('21:15');
    expect(formatTime('nope')).toBe('—');
  });

  test('adds the delay to the start, across midnight too', () => {
    expect(formatTime(arrivalTime('2026-10-18T21:00:00Z', 15))).toBe('21:15');
    expect(formatTime(arrivalTime('2026-10-18T23:50:00Z', 20))).toBe('00:10');
    expect(arrivalTime('2026-10-18T21:00:00Z', 0)).toBe('2026-10-18T21:00:00.000Z');
  });

  test('an invalid start gives an empty string instead of throwing', () => {
    expect(arrivalTime('garbage', 10)).toBe('');
  });
});
