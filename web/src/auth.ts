import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

export type AuthClient = Pick<SupabaseClient['auth'], 'getSession' | 'onAuthStateChange' | 'signInWithPassword' | 'signOut'>;

// Officers sign in with a nickname. Supabase wants an email, so we derive a private one.
// Mirrors src/services/officer.service.ts in the backend; never shown to the user.
const LOGIN_DOMAIN = 'wgt.invalid';
const NICKNAME = /^[a-z0-9][a-z0-9._-]{2,23}$/;

/** The hidden login address for a nickname, or null if the nickname is not allowed. */
export function nicknameToEmail(nickname: string): string | null {
  const name = nickname.trim().toLowerCase();
  return NICKNAME.test(name) ? `${name}@${LOGIN_DOMAIN}` : null;
}

export function createSupabaseAuth(env: Record<string, string | undefined> = import.meta.env): AuthClient {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  const missing = [!url && 'VITE_SUPABASE_URL', !key && 'VITE_SUPABASE_PUBLISHABLE_KEY'].filter(Boolean);
  if (!url || !key) throw new Error(`Sign-in is not configured: set ${missing.join(' and ')} (see web/.env.development).`);
  return createClient(url, key).auth;
}

/** The current session: undefined while it is being restored, null when signed out. */
export function useSession(auth: AuthClient): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let current = true;
    let heardEvent = false;
    const { data } = auth.onAuthStateChange((_event, next) => {
      heardEvent = true;
      if (current) setSession(next);
    });
    auth.getSession().then(
      ({ data: { session: stored } }) => { if (current && !heardEvent) setSession(stored); },
      () => { if (current && !heardEvent) setSession(null); },
    );
    return () => {
      current = false;
      data.subscription.unsubscribe();
    };
  }, [auth]);

  return session;
}
