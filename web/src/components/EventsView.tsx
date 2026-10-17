import { useMemo } from 'react';
import { useApi } from '../context';
import { orderEvents } from '../events';
import { formatRange } from '../format';
import { eventPath } from '../route';
import { useAsync } from '../useAsync';
import type { EventSummary } from '../types';
import { NewEventForm, type Creator } from './NewEventForm';

function creatorsFrom(characters: { userId: string; username: string }[]): Creator[] {
  const seen = new Map<string, Creator>();
  for (const { userId, username } of characters) if (!seen.has(userId)) seen.set(userId, { userId, username });
  return [...seen.values()].sort((a, b) => a.username.localeCompare(b.username));
}

function Counts({ event }: { event: EventSummary }) {
  const { counts } = event;
  return (
    <span className="counts">
      <span title="Answered IN">{counts.in} in</span>
      <span title="Confirmed for the raid">{counts.confirmed} confirmed</span>
      <span className="muted">{counts.tentative} tentative · {counts.bench} bench · {counts.out} out</span>
    </span>
  );
}

export function EventsView() {
  const api = useApi();
  const events = useAsync(() => api.listEvents(), [api]);
  const characters = useAsync(() => api.listCharacters(), [api]);
  const creators = useMemo(() => creatorsFrom(characters.data ?? []), [characters.data]);
  const ordered = useMemo(() => orderEvents(events.data ?? [], new Date()), [events.data]);

  return (
    <div className="stack">
      <section className="card" aria-labelledby="events-title">
        <div className="row">
          <h2 id="events-title">Events</h2>
          <button type="button" onClick={events.reload} disabled={events.loading}>Refresh</button>
        </div>

        {events.error && (
          <p role="alert" className="error">
            {events.error} <button type="button" onClick={events.reload}>Retry</button>
          </p>
        )}
        {events.loading && !events.data && <p className="muted" role="status">Loading events…</p>}
        {events.data && ordered.length === 0 && <p className="muted">No events yet. Create the first one below.</p>}

        {ordered.length > 0 && (
          <table className="table">
            <thead>
              <tr><th scope="col">Event</th><th scope="col">When</th><th scope="col">Status</th><th scope="col">Responses</th></tr>
            </thead>
            <tbody>
              {ordered.map(event => (
                <tr key={event.id}>
                  <td><a href={eventPath(event.id)}>{event.title}</a></td>
                  <td>{formatRange(event.startTime, event.endTime)}</td>
                  <td>
                    <span className={`badge ${event.isPublished ? 'badge-published' : 'badge-open'}`}>
                      {event.isPublished ? 'Published' : 'Open'}
                    </span>
                  </td>
                  <td><Counts event={event} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {characters.error
        ? <p role="alert" className="error">Could not load players: {characters.error}</p>
        : !characters.loading && <NewEventForm creators={creators} onCreated={events.reload} />}
    </div>
  );
}
