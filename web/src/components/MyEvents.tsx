import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { formatRange } from '../format';
import type { MyCharacterChoice, MyEvent, QuickAnswer, QuickStatus } from '../types';

const BUTTONS: { status: QuickStatus; label: string }[] = [
  { status: 'IN', label: 'In' }, { status: 'LATE', label: 'Late' }, { status: 'TENTATIVE', label: 'Tentative' }, { status: 'OUT', label: 'Out' },
];
const MAX_NOTE = 200;

const minutesLate = (event: MyEvent) => {
  const at = event.answer?.arrivalTime;
  return at ? Math.max(0, Math.round((Date.parse(at) - Date.parse(event.startTime)) / 60_000)) : null;
};

/** Where a published roster put me. */
function publishedLine(event: MyEvent, characters: MyCharacterChoice[]) {
  const a = event.answer;
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

function EventCard({ event, characters, busy, onAnswer }: {
  event: MyEvent; characters: MyCharacterChoice[]; busy: boolean; onAnswer: (answer: QuickAnswer) => Promise<string | null>;
}) {
  // Before answering the player picks a character here; after, the select shows what the server has.
  const [choice, setChoice] = useState(characters[0]?.id ?? '');
  const picked = event.answer?.characterId ?? choice;
  const [dialog, setDialog] = useState<'late' | 'note' | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const status = event.answer?.status;
  const closeDialog = () => { setDialog(null); setDialogError(null); };
  const send = async (answer: Omit<QuickAnswer, 'characterId'>, characterId = picked) => {
    const problem = await onAnswer({ characterId, ...answer });
    if (problem) setDialogError(problem); else closeDialog();
  };
  const lateDialog = dialog === 'late' || (dialog === 'note' && status === 'LATE');

  return (
    <article className="card stack my-event" aria-label={event.title}>
      <div className="row">
        <h3><Link href={`/events/${event.id}`}>{event.title}</Link></h3>
        {event.isPublished && <span className="badge badge-published">Published</span>}
      </div>
      <p className="muted">{formatRange(event.startTime, event.endTime)}</p>
      {event.isPublished ? <p>{publishedLine(event, characters)}</p> : characters.length > 0 && (
        <>
          {characters.length > 1 && (
            <div className="actions">
              <label htmlFor={`as-${event.id}`}>Answer with</label>
              <select id={`as-${event.id}`} value={picked} onChange={e => {
                if (status && status !== 'BENCH') void send({ status: status as QuickStatus }, e.target.value);
                else setChoice(e.target.value);
              }}>
                {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="actions" role="group" aria-label={`Your answer for ${event.title}`}>
            {BUTTONS.map(b => (
              <button key={b.status} type="button" aria-pressed={status === b.status} className={status === b.status ? 'primary' : undefined}
                onClick={() => (b.status === 'LATE' ? setDialog('late') : void send({ status: b.status }))}>{b.label}</button>
            ))}
            <button type="button" disabled={!event.answer} title={event.answer ? undefined : 'Answer first'} onClick={() => setDialog('note')}>Note…</button>
          </div>
          {event.answer?.note && <p className="person-note">{event.answer.note}</p>}
        </>
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
    </article>
  );
}

/** The player's upcoming events, answered from here like from Telegram. */
export function MyEvents({ characters, events, busy, onAnswer }: {
  characters: MyCharacterChoice[]; events: MyEvent[]; busy: boolean; onAnswer: (eventId: string, answer: QuickAnswer) => Promise<string | null>;
}) {
  return (
    <section className="stack" aria-label="Your next events">
      <h2>Your next events</h2>
      {characters.length === 0 && (
        <p className="muted">Add your characters on your profile and wait for an officer to approve one: then you answer here or on Telegram. <Link href="/profile">Open your profile</Link></p>
      )}
      {events.length === 0 ? <p className="muted">No events coming up.</p> : events.map(e => (
        <EventCard key={e.id} event={e} characters={characters} busy={busy} onAnswer={a => onAnswer(e.id, a)} />
      ))}
    </section>
  );
}
