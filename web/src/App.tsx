'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, type ReactNode } from 'react';
import { ApiError, createApi, type Api } from './api';
import { createSupabaseAuth, useSession, type AuthClient } from './auth';
import { AppearancePicker } from './components/AppearancePicker';
import { Login } from './components/Login';
import { Signup } from './components/Signup';
import { ChangePassword } from './components/ChangePassword';
import { TelegramCard } from './components/TelegramCard';
import { rememberLinkToken } from './telegramLink';
import { ApiContext, MetaContext, OfficerContext, PrefsContext } from './context';
import { usePrefs } from './theme';
import type { Officer } from './types';
import { errorMessage, useAsync } from './useAsync';

function Shell({ api, auth, officer, onSignOut, onAccountChanged, children }: {
  api: Api; auth: AuthClient; officer: Officer; onSignOut: () => void; onAccountChanged: () => void; children: ReactNode;
}) {
  const path = usePathname();
  const forced = officer.mustChangePassword === true;
  // With a temporary password the API refuses game data: don't ask for it until the password is changed.
  const meta = useAsync(() => (forced ? Promise.resolve(null) : api.getMeta()), [api, forced]);
  const onRoster = path.startsWith('/roster');
  const { prefs, setTheme, setIcons } = usePrefs();
  // ?? []: an API deployed before this site answers without capabilities; show the welcome, don't crash.
  const can = (capability: string) => (officer.capabilities ?? []).includes(capability);
  const hasPages = can('events.manage') || can('roster.manage') || can('accounts.manage');
  const onAccount = forced || path.startsWith('/account');

  return (
    <PrefsContext.Provider value={prefs}>
      <header className="topbar">
        <Link href="/events" className="brand">Guild Raid Admin</Link>
        <nav aria-label="Main">
          {!forced && can('events.manage') && <Link href="/events" aria-current={path.startsWith('/events') ? 'page' : undefined}>Events</Link>}
          {!forced && can('roster.manage') && <Link href="/roster" aria-current={onRoster ? 'page' : undefined}>Roster</Link>}
          {!forced && can('accounts.manage') && <Link href="/users" aria-current={path.startsWith('/users') ? 'page' : undefined}>Users</Link>}
        </nav>
        <AppearancePicker prefs={prefs} onTheme={setTheme} onIcons={setIcons} />
        <Link href="/account" className="muted" title="Your account">{officer.username}</Link>
        <button type="button" onClick={onSignOut}>Sign out</button>
      </header>
      <main className="page">
        {/* Needs no game data, so it never waits on (or fails with) it. */}
        {onAccount && (
          <div className="stack">
            {!forced && <TelegramCard username={officer.username} />}
            <ChangePassword auth={auth} username={officer.username} forced={forced} onDone={onAccountChanged} />
          </div>
        )}
        {!onAccount && meta.error && (
          <p role="alert" className="error">
            Could not load game data: {meta.error} <button type="button" onClick={meta.reload}>Retry</button>
          </p>
        )}
        {!onAccount && meta.loading && !meta.data && <p className="muted" role="status">Loading…</p>}
        {!onAccount && meta.data && (
          <MetaContext.Provider value={meta.data}>
            <OfficerContext.Provider value={officer}>{hasPages ? children : <Welcome officer={officer} />}</OfficerContext.Provider>
          </MetaContext.Provider>
        )}
      </main>
    </PrefsContext.Provider>
  );
}

/** What an account without officer pages sees (until the Profile page exists). */
function Welcome({ officer }: { officer: Officer }) {
  return (
    <section className="card stack">
      <h1>Welcome, {officer.username}</h1>
      <p>Your account is ready. Your role is <strong>{officer.role}</strong>.</p>
      <p className="muted">Your profile (characters, Telegram) is coming soon. An officer can give you more access.</p>
    </section>
  );
}

/** Asks the server who this is; only officers get past, and they get the whole app. */
function OfficerGate({ api, auth, onSignOut, children }: { api: Api; auth: AuthClient; onSignOut: () => void; children: ReactNode }) {
  const who = useAsync(
    () => api.me().then(
      officer => ({ officer }),
      error => (error instanceof ApiError && error.status === 403 ? { officer: null } : Promise.reject(error)),
    ),
    [api],
  );

  if (who.data?.officer) {
    return <Shell api={api} auth={auth} officer={who.data.officer} onSignOut={onSignOut} onAccountChanged={who.reload}>{children}</Shell>;
  }
  return (
    <main className="page login">
      <div className="card stack">
        {who.loading && <p className="muted" role="status">Loading…</p>}
        {who.data && <p role="alert" className="error">This account has no access to the site.</p>}
        {who.error && <p role="alert" className="error">Could not check your account: {who.error}</p>}
        {who.error && <button type="button" onClick={who.reload}>Retry</button>}
        {!who.loading && <button type="button" onClick={onSignOut}>Sign out</button>}
      </div>
    </main>
  );
}

function SignedIn({ auth, api: injected, fetchImpl, children }: { auth: AuthClient; api?: Api; fetchImpl?: typeof fetch; children: ReactNode }) {
  const session = useSession(auth);
  const path = usePathname();
  const onSignup = path === '/signup';
  useEffect(() => { if (path === '/link') rememberLinkToken(); }, [path]);
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
  if (session === null) return onSignup ? <Signup auth={auth} /> : <Login auth={auth} />;
  return (
    <ApiContext.Provider value={api}>
      <OfficerGate key={session.user.id} api={api} auth={auth} onSignOut={signOut}>{children}</OfficerGate>
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
