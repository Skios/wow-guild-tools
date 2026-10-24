import Link from 'next/link';
import { useMeta } from '../context';
import { formatDateTime } from '../format';
import { targetCounts } from '../roleTarget';
import type { AttendanceRow, CompositionRow, DashboardTodo, RoleId, Span } from '../types';
import { EventStateBadge } from './EventStateBadge';
import { RoleIcon } from './RoleIcon';

const ROLES: RoleId[] = ['TANK', 'HEALER', 'DPS', 'RANGED_DPS'];
const SPANS: { value: Span; label: string }[] = [
  { value: 5, label: 'Last 5 events' }, { value: 10, label: 'Last 10 events' }, { value: 20, label: 'Last 20 events' }, { value: 'season', label: 'Whole season' },
];

/** Each open event: confirmed per role against its target, who hasn't answered, the next reminder. */
export function Glance({ rows }: { rows: CompositionRow[] }) {
  const meta = useMeta();
  return (
    <section className="card stack" aria-label="Events at a glance">
      <h2>Events at a glance</h2>
      {rows.length === 0 ? <p className="muted">No open events.</p> : (
        <div className="table-wrap"><table className="table">
          <thead>
            <tr>
              <th scope="col">Event</th><th scope="col">Confirmed</th>
              {ROLES.map(r => <th key={r} scope="col"><RoleIcon role={r} /><span className="sr-only">{meta.roles.find(x => x.id === r)?.label}</span></th>)}
              <th scope="col">No answer</th><th scope="col">Next reminder</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const target = targetCounts(row.roleTarget, row.confirmed);
              return (
                <tr key={row.id}>
                  <th scope="row"><Link href={`/events/${row.id}`}>{row.title}</Link> <EventStateBadge state={row.state} /><span className="muted block">{formatDateTime(row.startTime)}</span></th>
                  <td>{row.confirmed}</td>
                  {ROLES.map(r => (
                    <td key={r}>{row.byRole[r]} <span className={`target${row.byRole[r] < target[r] ? ' short' : ''}`}>({target[r]}){row.byRole[r] < target[r] && <span className="sr-only"> short</span>}</span></td>
                  ))}
                  <td>{row.noAnswer}</td>
                  <td className="muted">{row.nextReminder ? formatDateTime(row.nextReminder) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
    </section>
  );
}

/** What needs an officer now. */
export function Todo({ todo }: { todo: DashboardTodo }) {
  const items = [
    ...(todo.pendingApprovals ? [<Link key="approve" href="/roster">{todo.pendingApprovals} character{todo.pendingApprovals === 1 ? '' : 's'} waiting for approval</Link>] : []),
    ...(todo.toPublish ?? []).map(e => <Link key={e.id} href={`/events/${e.id}`}>Publish {e.title} ({formatDateTime(e.startTime)})</Link>),
    ...(todo.noTelegram?.length ? [<span key="tg">No Telegram linked: {todo.noTelegram.map(p => p.name).join(', ')}</span>] : []),
  ];
  return (
    <section className="card stack" aria-label="To do">
      <h2>To do</h2>
      {items.length === 0 ? <p className="muted">Nothing to do.</p> : <ul className="plain-list stack">{items.map(item => <li key={item.key}>{item}</li>)}</ul>}
    </section>
  );
}

/** Per player: played, late, bench, out, tentative, no answer, over a span the officer picks. */
export function Attendance({ data, span, onSpan, loading = false }: {
  data: { events: number; players: AttendanceRow[] }; span: Span; onSpan: (span: Span) => void; loading?: boolean;
}) {
  return (
    <section className="card stack" aria-label="Attendance" aria-busy={loading}>
      <div className="row">
        <h2>Attendance</h2>
        <select aria-label="Attendance span" value={String(span)} onChange={e => onSpan(e.target.value === 'season' ? 'season' : Number(e.target.value))}>
          {SPANS.map(s => <option key={String(s.value)} value={String(s.value)}>{s.label}</option>)}
        </select>
      </div>
      <p className="muted">Over {data.events} published event{data.events === 1 ? '' : 's'}. Bench includes players not confirmed when the roster went out.</p>
      {data.players.length === 0 ? <p className="muted">Nobody on the roster yet.</p> : (
        <div className="table-wrap"><table className="table">
          <thead>
            <tr><th scope="col">Player</th><th scope="col">Played</th><th scope="col">Late</th><th scope="col">Bench</th><th scope="col">Out</th><th scope="col">Tentative</th><th scope="col">No answer</th></tr>
          </thead>
          <tbody>
            {data.players.map(p => (
              <tr key={p.id}><th scope="row">{p.name}</th><td>{p.in}</td><td>{p.late}</td><td>{p.bench}</td><td>{p.out}</td><td>{p.tentative}</td><td>{p.noAnswer}</td></tr>
            ))}
          </tbody>
        </table></div>
      )}
    </section>
  );
}
