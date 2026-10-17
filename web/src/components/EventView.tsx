import { useEffect, useMemo, useState } from 'react';
import { useApi, useMeta } from '../context';
import { formatRange } from '../format';
import {
  addCharacter, changedSelections, confirmRow, isDirty, rowsFromResponses, setStatus, sortRows, summarize,
  type RosterRow,
} from '../roster';
import { errorMessage, useAsync } from '../useAsync';
import type { CharacterSummary, EventDetail, ResponseStatus } from '../types';
import { AddCharacter } from './AddCharacter';
import { RoleIcon } from './RoleIcon';
import { RosterTable } from './RosterTable';

type Busy = 'saving' | 'publishing' | null;

export function EventView({ id }: { id: string }) {
  const api = useApi();
  const meta = useMeta();
  const event = useAsync(() => api.getEvent(id), [api, id]);
  const candidates = useAsync(() => api.listCharacters(), [api]);

  const [rows, setRows] = useState<RosterRow[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Rebuild the editable rows whenever fresh data arrives. Done during render (not in an effect)
  // so the table never flashes empty for a frame.
  const [source, setSource] = useState<EventDetail | null>(null);
  if (event.data && event.data !== source) {
    setSource(event.data);
    setRows(rowsFromResponses(event.data.responses));
  }

  const sorted = useMemo(() => sortRows(rows), [rows]);
  const summary = useMemo(() => summarize(rows), [rows]);
  const dirty = isDirty(rows);
  const published = event.data?.isPublished ?? false;
  const locked = published || busy !== null;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const edit = (characterId: string, change: (row: RosterRow) => RosterRow) => {
    setNotice(null);
    setRows(list => list.map(r => (r.characterId === characterId ? change(r) : r)));
  };

  async function run(kind: Exclude<Busy, null>, action: () => Promise<unknown>, done: string) {
    setBusy(kind);
    setProblem(null);
    setNotice(null);
    try {
      await action();
      setNotice(done);
      event.reload();
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setBusy(null);
      setConfirming(false);
    }
  }

  if (event.error && !event.data) {
    return (
      <div className="card" role="alert">
        <p className="error">{event.error}</p>
        <a href="#/events">← Back to events</a>
      </div>
    );
  }
  if (!event.data) return <p className="muted" role="status">Loading event…</p>;

  const data = event.data;
  const canPublish = !published && !dirty && summary.confirmed > 0;

  return (
    <div className="stack">
      <a href="#/events">← Events</a>

      <header className="card">
        <div className="row">
          <h2>{data.title}</h2>
          <span className={`badge ${published ? 'badge-published' : 'badge-open'}`}>{published ? 'Published' : 'Open'}</span>
        </div>
        <p className="muted">{formatRange(data.startTime, data.endTime)}</p>
        {data.description && <p>{data.description}</p>}

        <ul className="summary" aria-label="Roster summary">
          <li><strong>{summary.confirmed}</strong> confirmed</li>
          {meta.roles.map(r => (
            <li key={r.id} title={r.label}><RoleIcon role={r.id} /> {summary.byRole[r.id]}</li>
          ))}
          <li className="muted">{summary.byStatus.IN} in · {summary.byStatus.TENTATIVE} tentative · {summary.byStatus.BENCH} bench · {summary.byStatus.OUT} out</li>
        </ul>
      </header>

      {published && (
        <p className="notice" role="status">This roster has been published to the channel. It can no longer be changed.</p>
      )}
      {notice && <p className="notice" role="status">{notice}</p>}
      {(problem || event.error) && <p role="alert" className="error">{problem ?? event.error}</p>}

      <section className="card" aria-label="Roster">
        <RosterTable
          rows={sorted}
          disabled={locked}
          onStatus={(cid, status: ResponseStatus) => edit(cid, r => setStatus(r, status))}
          onConfirm={(cid, confirmed) => edit(cid, r => confirmRow(r, confirmed))}
        />

        {!published && (
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={!dirty || locked}
              onClick={() => run('saving', () => api.saveRoster(id, changedSelections(rows)), 'Roster saved.')}
            >
              {busy === 'saving' ? 'Saving…' : 'Save roster'}
            </button>
            <button type="button" disabled={!dirty || locked} onClick={() => { setRows(rowsFromResponses(data.responses)); setNotice(null); }}>
              Discard changes
            </button>
            {dirty && <span className="muted" role="status">Unsaved changes</span>}
          </div>
        )}
      </section>

      {!published && (
        <AddCharacter
          rows={rows}
          candidates={candidates.data}
          error={candidates.error}
          onAdd={(c: CharacterSummary) => { setNotice(null); setRows(list => addCharacter(list, c)); }}
        />
      )}

      {!published && (
        <section className="card" aria-label="Publish">
          <h3>Publish</h3>
          <p className="muted">
            Posts the roster to the channel and closes sign-ups. {dirty ? 'Save your changes first.' : summary.confirmed === 0 ? 'Confirm at least one player first.' : ''}
          </p>
          {!confirming ? (
            <button type="button" className="primary" disabled={!canPublish || locked} onClick={() => setConfirming(true)}>
              Publish roster
            </button>
          ) : (
            <div className="actions" role="group" aria-label="Confirm publication">
              <span>Post the roster of {summary.confirmed} player{summary.confirmed === 1 ? '' : 's'} to the channel?</span>
              <button type="button" className="danger" disabled={busy !== null} onClick={() => run('publishing', () => api.publish(id), 'Roster published.')}>
                {busy === 'publishing' ? 'Publishing…' : 'Yes, publish'}
              </button>
              <button type="button" disabled={busy !== null} onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
