'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, type ReactNode } from 'react';
import { ApiError, createApi, type Api } from './api';
import { createSupabaseAuth, useSession, type AuthClient } from './auth';
import { AppearancePicker } from './components/AppearancePicker';
import { Login } from './components/Login';
import { ApiContext, MetaContext, PrefsContext } from './context';
import { usePrefs } from './theme';
import type { Officer } from './types';
import { errorMessage, useAsync } from './useAsync';

function Shell({ api, officer, onSignOut, children }: { api: Api; officer: Officer; onSignOut: () => void; children: ReactNode }) {
  const meta = useAsync(() => api.getMeta(), [api]);
  const onRoster = usePathname().startsWith('/roster');
  const { prefs, setTheme, setIcons } = usePrefs();

  return (
    <PrefsContext.Provider value={prefs}>
      <header className="topbar">
        <Link href="/events" className="brand">Guild Raid Admin</Link>
        <nav aria-label="Main">
          <Link href="/events" aria-current={onRoster ? undefined : 'page'}>Events</Link>
          <Link href="/roster" aria-current={onRoster ? 'page' : undefined}>Roster</Link>
        </nav>
        <AppearancePicker prefs={prefs} onTheme={setTheme} onIcons={setIcons} />
        <span className="muted">{officer.username}</span>
        <button type="button" onClick={onSignOut}>Sign out</button>
      </header>
      <main className="page">
        {meta.error && (
          <p role="alert" className="error">
            Could not load game data: {meta.error} <button type="button" onClick={meta.reload}>Retry</button>
          </p>
        )}
        {meta.loading && !meta.data && <p className="muted" role="status">Loading…</p>}
        {meta.data && (
          <MetaContext.Provider value={meta.data}>
            {children}
          </MetaContext.Provider>
        )}
      </main>
    </PrefsContext.Provider>
  );
}

/** Asks the server who this is; only officers get past, and they get the whole app. */
function OfficerGate({ api, onSignOut, children }: { api: Api; onSignOut: () => void; children: ReactNode }) {
  const who = useAsync(
    () => api.me().then(
      officer => ({ officer }),
      error => (error instanceof ApiError && error.status === 403 ? { officer: null } : Promise.reject(error)),
    ),
    [api],
  );

  if (who.data?.officer) return <Shell api={api} officer={who.data.officer} onSignOut={onSignOut}>{children}</Shell>;
  return (
    <main className="page login">
      <div className="card stack">
        {who.loading && <p className="muted" role="status">Loading…</p>}
        {who.data && <p role="alert" className="error">This account is not an officer.</p>}
        {who.error && <p role="alert" className="error">Could not check your account: {who.error}</p>}
        {who.error && <button type="button" onClick={who.reload}>Retry</button>}
        {!who.loading && <button type="button" onClick={onSignOut}>Sign out</button>}
      </div>
    </main>
  );
}

function SignedIn({ auth, api: injected, fetchImpl, children }: { auth: AuthClient; api?: Api; fetchImpl?: typeof fetch; children: ReactNode }) {
  const session = useSession(auth);
  // Global sign-out revokes the refresh token; if that cannot be done (offline), at least end it here.
  const signOut = () => {
    auth.signOut().then(({ error }) => error && auth.signOut({ scope: 'local' }), () => auth.signOut({ scope: 'local' }));
  };
  const api = useMemo(
    () => injected ?? createApi({
      ...(fetchImpl && { fetchImpl }),
      getToken: async () => (await auth.getSession()).data.session?.access_token ?? null,
      onUnauthorized: () => { void auth.signOut({ scope: 'local' }); },
    }),
    [auth, injected, fetchImpl],
  );

  if (session === undefined) return <main className="page"><p className="muted" role="status">Loading…</p></main>;
  if (session === null) return <Login auth={auth} />;
  return (
    <ApiContext.Provider value={api}>
      <OfficerGate key={session.user.id} api={api} onSignOut={signOut}>{children}</OfficerGate>
    </ApiContext.Provider>
  );
}

export function App({ auth: injected, api, fetchImpl, children }: { auth?: AuthClient; api?: Api; fetchImpl?: typeof fetch; children: ReactNode }) {
  const setup = useMemo(() => {
    try {
      return { auth: injected ?? createSupabaseAuth() };
    } catch (error) {
      return { problem: errorMessage(error) };
    }
  }, [injected]);

  if (!setup.auth) return <main className="page"><p role="alert" className="error">{setup.problem}</p></main>;
  return <SignedIn auth={setup.auth} {...(api && { api })} {...(fetchImpl && { fetchImpl })}>{children}</SignedIn>;
}
