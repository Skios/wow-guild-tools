import type { Session } from '@supabase/supabase-js';
import { vi } from 'vitest';
import type { AuthClient } from '../auth';

export const SESSION = { access_token: 'tok-1', user: { id: 'u1' } } as Session;

type Listener = (event: string, session: Session | null) => void;

/** An in-memory stand-in for supabase.auth: no network, and `emit` plays server-side events. */
export function fakeAuth(initial: Session | null = SESSION) {
  const listeners = new Set<Listener>();
  const unsubscribe = vi.fn();
  let session = initial;
  const emit = (event: string, next: Session | null) => {
    session = next;
    listeners.forEach(l => l(event, next));
  };
  const auth = {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    onAuthStateChange: vi.fn((l: Listener) => {
      listeners.add(l);
      // Like supabase-js v2: the stored session is announced right after subscribing.
      void Promise.resolve().then(() => { if (listeners.has(l)) l('INITIAL_SESSION', session); });
      return { data: { subscription: { unsubscribe: () => { listeners.delete(l); unsubscribe(); } } } };
    }),
    signInWithPassword: vi.fn(async () => {
      emit('SIGNED_IN', SESSION);
      return { data: { session: SESSION }, error: null };
    }),
    signOut: vi.fn(async () => {
      emit('SIGNED_OUT', null);
      return { error: null };
    }),
  };
  return Object.assign(auth as unknown as AuthClient, { mocks: auth, emit, unsubscribe });
}
