import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi, useMeta } from '../context';
import { formatDateTime, formatRange } from '../format';
import {
  addCharacter, changedSelections, confirmRow, groupRows, isAttending, isDirty, rowsFromResponses, setLateMinutes, setPlaySpec, setStatus, summarize,
  type RoleOfSpec, type RosterRow,
} from '../roster';
import { errorMessage, useAsync } from '../useAsync';
import type { EventDetail, MessageResult, NoAnswerEntry, ResponseStatus } from '../types';
import { EventBoard } from './EventBoard';
import { EventReminders } from './EventReminders';
import { InviteMacros } from './InviteMacros';
import { PublishDialog } from './PublishDialog';
import { RoleTargetEditor } from './RoleTargetEditor';
import { coverSuggestions, targetCounts, type RoleTarget } from '../roleTarget';
import { NoAnswerPanel } from './NoAnswerPanel';
import { RoleIcon } from './RoleIcon';

type Busy = 'saving' | 'publishing' | 'messaging' | null;

export function EventView({ id }: { id: string }) {
  const api = useApi();
  const meta = useMeta();
  const event = useAsync(() => api.getEvent(id), [api, id]);
  const roleOf: RoleOfSpec = (classId, spec) => meta.classes.find(c => c.id === classId)?.specs.find(s => s.id === spec)?.role;

  const [rows, setRows] = useState<RosterRow[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [messageText, setMessageText] = useState('');
  const [results, setResults] = useState<MessageResult[] | null>(null);
  const publishButton = useRef<HTMLButtonElement>(null);
  const [editingTarget, setEditingTarget] = useState(false);

  // Rebuild the editable rows whenever fresh data arrives. Done during render (not in an effect)
  // so the board never flashes empty for a frame.
  const [source, setSource] = useState<EventDetail | null>(null);
  if (event.data && event.data !== source) {
    setSource(event.data);
    setRows(rowsFromResponses(event.data.responses, event.data.startTime, roleOf));
    setSelected(new Set());
  }

  const groups = useMemo(() => groupRows(rows), [rows]);
  const summary = useMemo(() => summarize(rows), [rows]);
  const pending = useMemo(
    () => (event.data?.noAnswer ?? []).filter(p => !rows.some(r => r.characterId === p.id)),
    [event.data, rows],
  );
  const dirty = isDirty(rows);
  const published = event.data?.isPublished ?? false;
  const locked = published || busy !== null;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Only people who are still visible in the no-answer or tentative lists can be messaged.
  const askable = useMemo(() => {
    const ids = new Set([...pending.map(p => p.id), ...groups.tentative.map(r => r.characterId)]);
    return [...selected].filter(cid => ids.has(cid));
  }, [pending, groups.tentative, selected]);

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

  async function sendMessage() {
    setBusy('messaging');
    setProblem(null);
    try {
      const sent = await api.message(id, askable, messageText.trim() || undefined);
      setResults(sent.results);
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const toggle = (characterId: string, on: boolean) =>
    setSelected(current => {
      const next = new Set(current);
      if (on) next.add(characterId); else next.delete(characterId);
      return next;
    });

  if (event.error && !event.data) {
    return (
      <div className="card" role="alert">
        <p className="error">{event.error}</p>
        <Link href="/events">← Back to events</Link>
      </div>
    );
  }
  if (!event.data) return <p className="muted" role="status">Loading event…</p>;

  const data = event.data;
  const canPublish = !published && summary.confirmed > 0;
  const target = targetCounts(data.roleTarget, summary.confirmed);
  const cover = coverSuggestions(rows, summary.byRole, target, roleOf);
  const saveTarget = (action: () => Promise<unknown>, done: string) =>
    run('saving', async () => { await action(); setEditingTarget(false); }, done);
  const defaultMessage = `Reminder: ${data.title} on ${formatDateTime(data.startTime)}. Are you coming?`;

  return (
    <div className="stack">
      <Link href="/events">← Events</Link>

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
            <li key={r.id} title={r.label}>
              <RoleIcon role={r.id} /> {summary.byRole[r.id]}{' '}
              <span className={`target${summary.byRole[r.id] < target[r.id] ? ' short' : ''}`}>({target[r.id]})</span>
            </li>
          ))}
          <li className="muted">
            {summary.byStatus.IN} in · {summary.byStatus.LATE} late · {summary.byStatus.TENTATIVE} tentative · {summary.byStatus.BENCH} bench · {summary.byStatus.OUT} out · {pending.length} no answer
          </li>
        </ul>
        <p className="muted target-line">
          Target in brackets: {data.roleTargetIsDefault ? 'the guild default' : 'this event\'s own'}
          {data.roleTarget.mode === 'flex' ? `, flex (${data.roleTarget.tanks} tanks, ${data.roleTarget.healersPer5} healer per 5, ${data.roleTarget.meleeShare}% melee DPS)` : `, ${data.roleTarget.size} players`}.
          {!published && !editingTarget && (
            <>
              {' '}<button type="button" className="link" onClick={() => setEditingTarget(true)}>Edit target</button>
              {!data.roleTargetIsDefault && <>{' '}<button type="button" className="link" disabled={locked || dirty} title={dirty ? 'Save the roster first' : undefined} onClick={() => saveTarget(() => api.setEventRoleTarget(id, null), 'Back to the guild default.')}>Use the guild default</button></>}
            </>
          )}
        </p>
        {editingTarget && (
          <RoleTargetEditor
            initial={data.roleTarget}
            busy={busy !== null}
            blocked={dirty ? 'Save the roster first: saving the target reloads the board.' : undefined}
            onCancel={() => setEditingTarget(false)}
            onSaveEvent={(t: RoleTarget) => saveTarget(() => api.setEventRoleTarget(id, t), 'Target saved for this event.')}
            onSaveDefault={(t: RoleTarget) => saveTarget(() => api.setDefaultRoleTarget(t), 'Saved as the guild default.')}
          />
        )}
      </header>

      {published && (
        <p className="notice" role="status">This roster has been published to the channel. It can no longer be changed.</p>
      )}
      {notice && <p className="notice" role="status">{notice}</p>}
      {(problem || event.error) && <p role="alert" className="error">{problem ?? event.error}</p>}

      <div className="board">
        <EventBoard
          groups={groups}
          handlers={{
            disabled: locked,
            eventStart: data.startTime,
            onStatus: (cid, status: ResponseStatus) => edit(cid, r => setStatus(r, status)),
            onConfirm: (cid, confirmed) => edit(cid, r => confirmRow(r, confirmed)),
            onLateMinutes: (cid, minutes) => edit(cid, r => setLateMinutes(r, minutes)),
            cover,
            onPlaySpec: (cid, spec) => edit(cid, r => setPlaySpec(r, spec, spec ? roleOf(r.class, spec) : undefined)),
            ...(!dirty && {
              onSwitch: (cid: string, to: string) => {
                const row = rows.find(r => r.characterId === cid);
                const target = row?.alternatives?.find(a => a.id === to);
                return run('saving', () => api.switchCharacter(id, cid, to), `${row?.name} now comes as ${target?.name}.`);
              },
            }),
            selected,
            onSelect: toggle,
          }}
        />
        <NoAnswerPanel
          people={pending}
          selected={selected}
          recipientCount={askable.length}
          disabled={locked}
          defaultMessage={defaultMessage}
          text={messageText}
          sending={busy === 'messaging'}
          results={results}
          onText={setMessageText}
          onToggle={toggle}
          onSelectReachable={() => setSelected(current => new Set([...current, ...pending.filter(p => p.reachable).map(p => p.id)]))}
          onClearSelection={() => setSelected(new Set())}
          onMark={(person: NoAnswerEntry, status) => { setNotice(null); setRows(list => addCharacter(list, person, status)); }}
          onSend={sendMessage}
        />
      </div>

      {!published && (
        <section className="card" aria-label="Save roster">
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={!dirty || locked}
              onClick={() => run('saving', () => api.saveRoster(id, changedSelections(rows)), 'Roster saved.')}
            >
              {busy === 'saving' ? 'Saving…' : 'Save roster'}
            </button>
            <button
              type="button"
              disabled={!dirty || locked}
              onClick={() => { setRows(rowsFromResponses(data.responses, data.startTime, roleOf)); setNotice(null); }}
            >
              Discard changes
            </button>
            {dirty && <span className="muted" role="status">Unsaved changes{rows.some(r => r.alternatives?.length) && ' · save them to switch characters'}</span>}
          </div>
        </section>
      )}

      {/* Who is confirmed right now on the board, saved or not. */}
      <InviteMacros people={rows.filter(r => isAttending(r.status) && r.isConfirmed)} />

      {/* Keyed on the list: a reload with reminders sent meanwhile starts it afresh. */}
      <EventReminders key={data.reminders.map(r => `${r.minutesBefore}:${r.sentAt ?? ''}`).join()} eventId={id} initial={data.reminders} closed={published} />

      {!published && (
        <section className="card" aria-label="Publish">
          <h3>Publish</h3>
          <p className="muted">
            Posts the roster to the channel and closes sign-ups. {summary.confirmed === 0 ? 'Confirm at least one player first.' : dirty ? 'Unsaved changes are saved with it.' : ''}
          </p>
          <button type="button" ref={publishButton} className="primary" disabled={!canPublish || locked} onClick={() => setConfirming(true)}>
            Publish roster
          </button>
          {confirming && (
            <PublishDialog
              rows={rows}
              busy={busy !== null}
              onCancel={() => { setConfirming(false); publishButton.current?.focus(); }}
              onPublish={final => run('publishing', async () => {
                const changes = changedSelections(final);
                if (changes.length > 0) {
                  await api.saveRoster(id, changes);
                  event.reload(); // saved even if publishing fails next: the board must show it
                }
                try {
                  await api.publish(id);
                } catch (e) {
                  throw changes.length > 0 ? new Error(`Roster saved, but publishing failed: ${errorMessage(e)}`) : e;
                }
              }, 'Roster published.')}
            />
          )}
        </section>
      )}
    </div>
  );
}
