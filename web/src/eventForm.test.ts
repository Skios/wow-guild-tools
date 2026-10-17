import { describe, expect, test } from 'vitest';
import { validateNewEvent, type EventFormValues } from './eventForm';

const NOW = new Date('2026-10-17T12:00:00Z');
const valid: EventFormValues = {
  title: 'Mythic Raid',
  start: '2026-10-18T19:00',
  end: '2026-10-18T22:00',
  description: '',
};
const check = (patch: Partial<EventFormValues> = {}) => validateNewEvent({ ...valid, ...patch }, NOW);

describe('validateNewEvent', () => {
  test('builds the API payload from valid values, trimming text and converting dates', () => {
    const result = check({ title: '  Mythic Raid ', description: '  Bring flasks ' });

    expect(result.errors).toEqual({});
    expect(result.payload).toEqual({
      title: 'Mythic Raid',
      startTime: '2026-10-18T19:00:00.000Z',
      endTime: '2026-10-18T22:00:00.000Z',
      description: 'Bring flasks',
    });
  });

  test('leaves the description out when it is blank', () => {
    expect(check({ description: '   ' }).payload).not.toHaveProperty('description');
  });

  test.each(['', '   '])('requires a title (%j)', (title) => {
    const result = check({ title });
    expect(result.errors.title).toBeDefined();
    expect(result.payload).toBeNull();
  });

  test('title limit is 100 characters', () => {
    expect(check({ title: 'a'.repeat(100) }).errors.title).toBeUndefined();
    expect(check({ title: 'a'.repeat(101) }).errors.title).toBeDefined();
  });

  test('description limit is 1000 characters', () => {
    expect(check({ description: 'a'.repeat(1000) }).errors.description).toBeUndefined();
    expect(check({ description: 'a'.repeat(1001) }).errors.description).toBeDefined();
  });

  test.each(['start', 'end'] as const)('requires a valid %s', (field) => {
    expect(check({ [field]: '' }).errors[field]).toBeDefined();
    expect(check({ [field]: '2026-02-30T10:00' }).errors[field]).toBeDefined();
  });

  test('end must be after start', () => {
    expect(check({ end: valid.start }).errors.end).toMatch(/after/i);
    expect(check({ end: '2026-10-18T18:00' }).errors.end).toMatch(/after/i);
  });

  test('events last at most 24 hours', () => {
    expect(check({ start: '2026-10-18T10:00', end: '2026-10-19T10:00' }).errors.end).toBeUndefined();
    expect(check({ start: '2026-10-18T10:00', end: '2026-10-19T10:01' }).errors.end).toMatch(/24/);
  });

  test('the event cannot already be over', () => {
    expect(check({ start: '2026-10-16T10:00', end: '2026-10-16T12:00' }).errors.end).toMatch(/past|over|ended/i);
  });

  test('an event that is in progress is fine', () => {
    expect(check({ start: '2026-10-17T11:00', end: '2026-10-17T14:00' }).errors).toEqual({});
  });

  test('reports every problem at once', () => {
    const result = check({ title: '', end: '', start: '' });
    expect(Object.keys(result.errors).sort()).toEqual(['end', 'start', 'title']);
  });
});
