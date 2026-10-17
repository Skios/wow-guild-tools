import { useCallback, useMemo, useRef, useState } from 'react';
import { createApi, type Api } from './api';
import { EventView } from './components/EventView';
import { EventsView } from './components/EventsView';
import { LoginView } from './components/LoginView';
import { ApiContext, MetaContext } from './context';
import { useRoute } from './route';
import { useSession } from './session';
import { useAsync } from './useAsync';

function Shell({ onLogout, api }: { onLogout: () => void; api: Api }) {
  const meta = useAsync(() => api.getMeta(), [api]);
  const route = useRoute();

  return (
    <>
      <header className="topbar">
        <a href="#/events" className="brand">Guild Raid Admin</a>
        <button type="button" onClick={onLogout}>Sign out</button>
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
            {route.name === 'event' ? <EventView id={route.id} /> : <EventsView />}
          </MetaContext.Provider>
        )}
      </main>
    </>
  );
}

export function App({ api: injected }: { api?: Api }) {
  const { apiKey, login, logout } = useSession();
  const [expired, setExpired] = useState(false);
  const keyRef = useRef(apiKey);
  keyRef.current = apiKey;

  const onUnauthorized = useCallback(() => { setExpired(true); logout(); }, [logout]);
  const api = useMemo(
    () => injected ?? createApi({ getKey: () => keyRef.current, onUnauthorized }),
    [injected, onUnauthorized],
  );

  return (
    <ApiContext.Provider value={api}>
      {apiKey ? (
        <Shell api={api} onLogout={logout} />
      ) : (
        <>
          {expired && <p role="status" className="notice banner">Your session ended. Sign in again.</p>}
          <LoginView onLogin={key => { setExpired(false); login(key); }} />
        </>
      )}
    </ApiContext.Provider>
  );
}
