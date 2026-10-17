import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { eventPath, parseHash, useRoute } from './route';

describe('parseHash', () => {
  test.each(['', '#', '#/', '#/events', '#/events/', '#/nope', '#/events/a/b', '#/events/%E0%A4%A'])(
    'falls back to the events list for %j',
    (hash) => {
      expect(parseHash(hash)).toEqual({ name: 'events' });
    },
  );

  test('recognises an event page', () => {
    expect(parseHash('#/events/abc-123')).toEqual({ name: 'event', id: 'abc-123' });
  });

  test('decodes the id', () => {
    expect(parseHash('#/events/a%20b')).toEqual({ name: 'event', id: 'a b' });
  });
});

describe('roster page', () => {
  test('has its own address', () => {
    expect(parseHash('#/roster')).toEqual({ name: 'roster' });
    expect(parseHash('#roster')).toEqual({ name: 'roster' });
  });

  test('anything after it is not the roster page', () => {
    expect(parseHash('#/roster/extra')).toEqual({ name: 'events' });
  });
});

describe('eventPath', () => {
  test('encodes the id so it survives a round trip', () => {
    const id = 'a/b c?d';
    expect(parseHash(eventPath(id))).toEqual({ name: 'event', id });
  });
});

describe('useRoute', () => {
  test('follows the URL hash', () => {
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ name: 'events' });

    act(() => {
      window.location.hash = '#/events/e1';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(result.current).toEqual({ name: 'event', id: 'e1' });
  });

  test('starts from the current hash', () => {
    window.location.hash = '#/events/e9';
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ name: 'event', id: 'e9' });
  });
});
