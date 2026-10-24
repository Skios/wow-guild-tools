import { describe, expect, test } from 'vitest';
import { DEFAULT_REMINDERS, beforeLabel, reminderError } from './reminders';

describe('beforeLabel', () => {
  test.each([
    [1440, '1 day before'],
    [2880, '2 days before'],
    [480, '8 h before'],
    [1800, '1 day 6 h before'],
    [30, '30 min before'],
    [90, '1 h 30 min before'],
  ])('%i minutes reads "%s"', (minutes, label) => {
    expect(beforeLabel(minutes)).toBe(label);
  });
});

describe('reminderError', () => {
  test('a day and eight hours before is the default, and valid', () => {
    expect(DEFAULT_REMINDERS).toEqual([1440, 480]);
    expect(reminderError([1440], 480)).toBeNull();
  });

  test.each([
    [[], 0, /at least 5 minutes/],
    [[], 2, /at least 5 minutes/],
    [[], 14 * 1440 + 1, /14 days/],
    [[480], 480, /already/],
    [[10, 20, 30, 40, 50], 60, /at most 5/],
    [[], 1.5, /whole/],
  ])('rejects %j + %d', (list, minutes, message) => {
    expect(reminderError(list, minutes)).toMatch(message);
  });
});
