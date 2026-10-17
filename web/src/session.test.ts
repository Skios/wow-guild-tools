import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { clearKey, loadKey, saveKey, useSession } from './session';

afterEach(() => vi.restoreAllMocks());

describe('key storage', () => {
  test('round trips through sessionStorage, not localStorage', () => {
    saveKey('abc');
    expect(loadKey()).toBe('abc');
    expect(localStorage.length).toBe(0);
    clearKey();
    expect(loadKey()).toBeNull();
  });

  test('works even when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });

    expect(loadKey()).toBeNull();
    expect(() => saveKey('abc')).not.toThrow();
    expect(() => clearKey()).not.toThrow();
  });
});

describe('useSession', () => {
  test('starts logged out', () => {
    const { result } = renderHook(() => useSession());
    expect(result.current.apiKey).toBeNull();
  });

  test('restores a stored key after a page reload', () => {
    saveKey('stored');
    const { result } = renderHook(() => useSession());
    expect(result.current.apiKey).toBe('stored');
  });

  test('login and logout update state and storage', () => {
    const { result } = renderHook(() => useSession());

    act(() => result.current.login('k1'));
    expect(result.current.apiKey).toBe('k1');
    expect(loadKey()).toBe('k1');

    act(() => result.current.logout());
    expect(result.current.apiKey).toBeNull();
    expect(loadKey()).toBeNull();
  });

  test('keeps the session in memory when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const { result } = renderHook(() => useSession());

    act(() => result.current.login('k1'));

    expect(result.current.apiKey).toBe('k1');
  });
});
