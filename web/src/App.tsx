import { useMemo } from 'react';
import { createApi, type Api } from './api';
import { AppearancePicker } from './components/AppearancePicker';
import { EventView } from './components/EventView';
import { EventsView } from './components/EventsView';
import { RosterView } from './components/RosterView';
import { ApiContext, MetaContext, PrefsContext } from './context';
import { useRoute } from './route';
import { usePrefs } from './theme';
import { useAsync } from './useAsync';

function Shell({ api }: { api: Api }) {
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

export function App({ api: injected }: { api?: Api }) {
  const api = useMemo(() => injected ?? createApi(), [injected]);
  return (
    <ApiContext.Provider value={api}>
      <Shell api={api} />
    </ApiContext.Provider>
  );
}
