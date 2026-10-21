import { useMemo } from 'react';
import { ApiError, createApi, type Api } from './api';
import { createSupabaseAuth, useSession, type AuthClient } from './auth';
import { AppearancePicker } from './components/AppearancePicker';
import { EventView } from './components/EventView';
import { EventsView } from './components/EventsView';
import { Login } from './components/Login';
import { RosterView } from './components/RosterView';
import { ApiContext, MetaContext, PrefsContext } from './context';
import { useRoute } from './route';
import { usePrefs } from './theme';
import type { Officer } from './types';
import { errorMessage, useAsync } from './useAsync';

function Shell({ api, officer, onSignOut }: { api: Api; officer: Officer; onSignOut: () => void }) {
  const meta = useAsync(() => api.getMeta(), [api]);
  const route = useRoute();
  const { prefs, setTheme, setIcons } = usePrefs();

  return (
    <PrefsContext.Provider value={prefs}>
      <header className="topbar">
        <a href="#/events" className="brand">Guild Raid Admin</a>
        <nav aria-label="Main">
          <a href="#/events" aria-current={route.name !== 'roster' ? 'page' : undefined}>Events</a>
          <a href="#/roster" aria-current={route.name === 'roster' ? 'page' : undefined}>Roster</a>
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
            {route.name === 'event' ? <EventView id={route.id} /> : route.name === 'roster' ? <RosterView /> : <EventsView />}
          </MetaContext.Provider>
        )}
      </main>
    </PrefsContext.Provider>
  );
}

/** Asks the server who this is; only officers get past, and they get the whole app. */
function OfficerGate({ api, onSignOut }: { api: Api; onSignOut: () => void }) {
  const who = useAsync(
    () => api.me().then(
      officer => ({ officer }),
      error => (error instanceof ApiError && error.status === 403 ? { officer: null } : Promise.reject(error)),
    ),
    [api],
  );

  if (who.data?.officer) return <Shell api={api} officer={who.data.officer} onSignOut={onSignOut} />;
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

function SignedIn({ auth, api: injected, fetchImpl }: { auth: AuthClient; api?: Api; fetchImpl?: typeof fetch }) {
  const session = useSession(auth);
  const signOut = () => { void auth.signOut({ scope: 'local' }); };
  const api = useMemo(
    () => injected ?? createApi({
      ...(fetchImpl && { fetchImpl }),
      getToken: async () => (await auth.getSession()).data.session?.access_token ?? null,
      onUnauthorized: () => { void auth.signOut({ scope: 'local' }); },
    }),
    [auth, injected, fetchImpl],
  );

  if (session === undefined) return <p className="muted page" role="status">Loading…</p>;
  if (session === null) return <Login auth={auth} />;
  return (
    <ApiContext.Provider value={api}>
      <OfficerGate api={api} onSignOut={signOut} />
    </ApiContext.Provider>
  );
}

export function App({ auth: injected, api, fetchImpl }: { auth?: AuthClient; api?: Api; fetchImpl?: typeof fetch }) {
  const setup = useMemo(() => {
    try {
      return { auth: injected ?? createSupabaseAuth() };
    } catch (error) {
      return { problem: errorMessage(error) };
    }
  }, [injected]);

  if (!setup.auth) return <main className="page"><p role="alert" className="error">{setup.problem}</p></main>;
  return <SignedIn auth={setup.auth} {...(api && { api })} {...(fetchImpl && { fetchImpl })} />;
}
