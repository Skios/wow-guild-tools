import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMeta } from '../context';
import { formatRange } from '../format';
import type { MyCharacterChoice, MyEvent, QuickAnswer, QuickStatus } from '../types';
import { CharacterName } from './CharacterName';
import { EventStateBadge } from './EventStateBadge';

const BUTTONS: { status: QuickStatus; label: string }[] = [
  { status: 'IN', label: 'In' }, { status: 'LATE', label: 'Late' }, { status: 'TENTATIVE', label: 'Tentative' }, { status: 'OUT', label: 'Out' },
];
const MAX_NOTE = 200;

const minutesLate = (event: MyEvent) => {
  const at = event.answer?.arrivalTime;
  return at ? Math.max(0, Math.round((Date.parse(at) - Date.parse(event.startTime)) / 60_000)) : null;
};

/** Where I stand once answers are closed (published, started, cancelled). */
function closedLine(event: MyEvent, characters: MyCharacterChoice[]) {
  if (event.state === 'CANCELED') return 'This event is cancelled.';
  const a = event.answer;
  if (!event.isPublished) return a ? `Sign-ups are closed: you said ${a.status.toLowerCase()}.` : 'Sign-ups are closed.';
  if (!a) return 'Published without your answer.';
  const name = characters.find(c => c.id === a.characterId)?.name ?? 'your character';
  if ((a.status === 'IN' || a.status === 'LATE') && a.isConfirmed) return `You're in the team with ${name}.`;
  if (a.status === 'IN' || a.status === 'LATE' || a.status === 'BENCH') return `On the bench with ${name}.`;
  return a.status === 'OUT' ? 'You said out.' : 'You said tentative.';
}

function AnswerDialog({ title, late, initialMinutes, initialNote, busy, error, onSave, onCancel }: {
  title: string; late: boolean; initialMinutes: number | null; initialNote: string; busy: boolean; error: string | null;
  onSave: (minutes: number | undefined, note: string) => void; onCancel: () => void;
}) {
  const [minutes, setMinutes] = useState(initialMinutes === null ? '' : String(initialMinutes));
  const [note, setNote] = useState(initialNote);
  // Read on the first render, before autoFocus moves focus into the dialog: the button that opened it.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  // Escape from anywhere on the page; on close (unmount only), focus goes back to that button.
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel.current(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); opener?.focus(); };
  }, [opener]);
  return (
    <div className="modal-backdrop">
      <form role="dialog" aria-modal="true" aria-label={title} className="modal stack"
        onSubmit={e => { e.preventDefault(); if (!busy) onSave(late && minutes !== '' ? Number(minutes) : undefined, note); }}>
        <h2>{title}</h2>
        {late && (
          <div>
            <label htmlFor="answer-minutes">Minutes late</label>
            <input id="answer-minutes" type="number" min={0} max={720} step={1} inputMode="numeric" autoFocus value={minutes} onChange={e => setMinutes(e.target.value)} />
          </div>
        )}
        <div>
          <label htmlFor="answer-note">Note</label>
          <textarea id="answer-note" rows={2} maxLength={MAX_NOTE} autoFocus={!late} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. leaving 30 min early" />
        </div>
        {error && <p role="alert" className="error">{error}</p>}
        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>Save</button>
          <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

const STATUS_ICON: Record<QuickStatus, string> = { IN: '✅', LATE: '⏰', TENTATIVE: '❓', OUT: '❌' };
const STATUS_TEXT: Record<string, string> = { IN: 'In', LATE: 'Late', TENTATIVE: 'Tentative', OUT: 'Out', BENCH: 'Bench' };

function EventRow({ event, characters, busy, onAnswer }: {
  event: MyEvent; characters: MyCharacterChoice[]; busy: boolean; onAnswer: (answer: QuickAnswer) => Promise<string | null>;
}) {
  const meta = useMeta();
  const colour = (classId: string) => meta.classes.find(c => c.id === classId)?.color;
  // Before answering the player picks a character here; after, the select shows what the server has.
  const [choice, setChoice] = useState(characters[0]?.id ?? '');
  const picked = event.answer?.characterId ?? choice;
  const pickedClass = characters.find(c => c.id === picked)?.class;
  const [dialog, setDialog] = useState<'late' | 'note' | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const status = event.answer?.status;
  const closeDialog = () => { setDialog(null); setDialogError(null); };
  const send = async (answer: Omit<QuickAnswer, 'characterId'>, characterId = picked) => {
    const problem = await onAnswer({ characterId, ...answer });
    if (problem) setDialogError(problem); else closeDialog();
  };
  const lateDialog = dialog === 'late' || (dialog === 'note' && status === 'LATE');
  const answeredWith = characters.find(c => c.id === event.answer?.characterId);

  return (
    <tr aria-label={event.title}>
      <th scope="row">
        <Link href={`/events/${event.id}`}>{event.title}</Link> {event.state !== 'OPEN' && <EventStateBadge state={event.state} />}
        <span className="muted block">{formatRange(event.startTime, event.endTime)}</span>
      </th>
      <td>
        {status ? <strong>{STATUS_TEXT[status]}</strong> : <span className="muted">No answer</span>}
        {answeredWith && <span className="block"><CharacterName name={answeredWith.name} classId={answeredWith.class} /></span>}
        {event.answer?.note && <span className="person-note">{event.answer.note}</span>}
      </td>
      <td className="my-action">
        {event.state !== 'OPEN' ? <span>{closedLine(event, characters)}</span> : characters.length > 0 && (
          <div className="stack tight">
            {characters.length > 1 && (
              <select aria-label="Answer with" className="class-select" value={picked} style={{ color: pickedClass && colour(pickedClass) }} onChange={e => {
                if (status && status !== 'BENCH') void send({ status: status as QuickStatus }, e.target.value);
                else setChoice(e.target.value);
              }}>
                {characters.map(c => <option key={c.id} value={c.id} style={{ color: colour(c.class) }}>{c.name}</option>)}
              </select>
            )}
            <div className="actions compact" role="group" aria-label={`Your answer for ${event.title}`}>
              {BUTTONS.map(b => (
                <button key={b.status} type="button" className={`icon-button${status === b.status ? ' primary' : ''}`} aria-pressed={status === b.status}
                  aria-label={b.label} title={b.label} {...(b.status === 'LATE' && { 'aria-haspopup': 'dialog' as const })} onClick={() => (b.status === 'LATE' ? setDialog('late') : void send({ status: b.status }))}>
                  <span aria-hidden="true">{STATUS_ICON[b.status]}</span>
                </button>
              ))}
              <button type="button" disabled={!event.answer} title={event.answer ? undefined : 'Answer first'} onClick={() => setDialog('note')}>Note…</button>
            </div>
          </div>
        )}
        {dialog && (
          <AnswerDialog
            title={`${dialog === 'late' ? 'Late' : 'Note'} for ${event.title}`}
            late={lateDialog}
            initialMinutes={minutesLate(event)}
            initialNote={event.answer?.note ?? ''}
            busy={busy}
            error={dialogError}
            onCancel={closeDialog}
            onSave={(minutes, note) => void send({
              status: dialog === 'late' ? 'LATE' : (status as QuickStatus),
              ...(minutes !== undefined && { lateMinutes: minutes }),
              // Sent when it changed (an emptied box clears it), or always from the Note dialog.
              ...((dialog === 'note' || note !== (event.answer?.note ?? '')) && { note }),
            })}
          />
        )}
      </td>
    </tr>
  );
}

/** The player's upcoming events, answered from here like from Telegram. */
export function MyEvents({ characters, events, busy, onAnswer }: {
  characters: MyCharacterChoice[]; events: MyEvent[]; busy: boolean; onAnswer: (eventId: string, answer: QuickAnswer) => Promise<string | null>;
}) {
  return (
    <section className="card stack" aria-label="Your next events">
      <h2>Your next events</h2>
      {characters.length === 0 && (
        <p className="muted">Add your characters on your profile and wait for an officer to approve one: then you answer here or on Telegram. <Link href="/profile">Open your profile</Link></p>
      )}
      {events.length === 0 ? <p className="muted">No events coming up.</p> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th scope="col">Event</th><th scope="col">Your answer</th><th scope="col">Action</th></tr></thead>
          <tbody>
            {events.map(e => <EventRow key={e.id} event={e} characters={characters} busy={busy} onAnswer={a => onAnswer(e.id, a)} />)}
          </tbody>
        </table></div>
      )}
    </section>
  );
}
