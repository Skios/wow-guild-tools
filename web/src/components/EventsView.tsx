import Link from 'next/link';
import { useMemo } from 'react';
import { useApi } from '../context';
import { orderEvents } from '../events';
import { formatRange } from '../format';
import { useAsync } from '../useAsync';
import type { EventSummary } from '../types';
import { NewEventForm } from './NewEventForm';
import { EventStateBadge } from './EventStateBadge';

function Counts({ event }: { event: EventSummary }) {
  const { counts } = event;
  return (
    <span className="counts">
      <span title="Answered IN">{counts.in} in{counts.late > 0 && ` · ${counts.late} late`}</span>
      <span title="Confirmed for the raid">{counts.confirmed} confirmed</span>
      <span className="muted">{counts.tentative} tentative · {counts.bench} bench · {counts.out} out · {counts.noAnswer} no answer</span>
    </span>
  );
}

export function EventsView() {
  const api = useApi();
  const events = useAsync(() => api.listEvents(), [api]);
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
                  <td><Link href={`/events/${encodeURIComponent(event.id)}`}>{event.title}</Link></td>
                  <td>{formatRange(event.startTime, event.endTime)}</td>
                  <td>
                    <EventStateBadge state={event.state} />
                  </td>
                  <td><Counts event={event} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <NewEventForm onCreated={events.reload} />
    </div>
  );
}
