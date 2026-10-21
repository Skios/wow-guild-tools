import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import * as supabase from '@supabase/supabase-js';
import { createSupabaseAuth, nicknameToEmail, useSession } from './auth';
import { SESSION, fakeAuth } from './test/auth';

vi.mock('@supabase/supabase-js', async importOriginal => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>();
  return { ...actual, createClient: vi.fn(actual.createClient) };
});

describe('nicknameToEmail', () => {
  test.each([
    ['cid', 'cid@wgt.invalid'],
    ['  Cid  ', 'cid@wgt.invalid'],
    ['A.b_c-9', 'a.b_c-9@wgt.invalid'],
    ['a'.repeat(24), `${'a'.repeat(24)}@wgt.invalid`],
  ])('maps %j to the hidden login address', (nick, email) => {
    expect(nicknameToEmail(nick)).toBe(email);
  });

  test.each(['', '   ', 'ab', 'a'.repeat(25), '-abc', '.abc', 'a b c', 'a@b.com', 'über', '😀😀😀'])(
    'rejects %j', nick => {
      expect(nicknameToEmail(nick)).toBeNull();
    });
});

describe('createSupabaseAuth', () => {
  test('explains which settings are missing', () => {
    expect(() => createSupabaseAuth({})).toThrow(/VITE_SUPABASE_URL/);
    expect(() => createSupabaseAuth({ VITE_SUPABASE_URL: 'http://x' })).toThrow(/VITE_SUPABASE_PUBLISHABLE_KEY/);
    expect(() => createSupabaseAuth({ VITE_SUPABASE_URL: ' ', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' })).toThrow(/VITE_SUPABASE_URL/);
  });

  test('never reads a session out of the URL', () => {
    const spy = vi.mocked(supabase.createClient);
    createSupabaseAuth({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' });
    expect(spy).toHaveBeenCalledWith('http://127.0.0.1:54321', 'k', { auth: { detectSessionInUrl: false } });
  });

  test('builds a client from the settings', () => {
    const auth = createSupabaseAuth({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' });
    expect(typeof auth.signInWithPassword).toBe('function');
  });
});

describe('useSession', () => {
  test('is undefined while restoring, then the stored session', async () => {
    const auth = fakeAuth();
    const { result } = renderHook(() => useSession(auth));
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe(SESSION));
  });

  test('is null when nobody is signed in', async () => {
    const { result } = renderHook(() => useSession(fakeAuth(null)));
    await waitFor(() => expect(result.current).toBeNull());
  });

  test('follows sign-in and sign-out, and stops listening on unmount', async () => {
    const auth = fakeAuth(null);
    const { result, unmount } = renderHook(() => useSession(auth));
    await waitFor(() => expect(result.current).toBeNull());

    act(() => auth.emit('SIGNED_IN', SESSION));
    expect(result.current).toBe(SESSION);
    act(() => auth.emit('SIGNED_OUT', null));
    expect(result.current).toBeNull();

    unmount();
    expect(auth.unsubscribe).toHaveBeenCalled();
  });

});
