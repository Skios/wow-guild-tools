import { useState } from 'react';
import { confirmRow, isAttending, sendUnconfirmed, type RosterRow } from '../roster';
import { CharacterName } from './CharacterName';

type Leftover = 'BENCH' | 'OUT';

type Props = {
  rows: RosterRow[];
  busy: boolean;
  onCancel: () => void;
  /** The board as it will be published: confirmations changed here, the unconfirmed moved. */
  onPublish: (rows: RosterRow[]) => void;
};

/** Last look before publishing: every answer with a note (tick to change), and where the unconfirmed go. */
export function PublishDialog({ rows, busy, onCancel, onPublish }: Props) {
  const [draft, setDraft] = useState(rows);
  const [to, setTo] = useState<Leftover>('BENCH');
  const withNotes = draft.filter(r => r.note);
  const confirmed = draft.filter(r => isAttending(r.status) && r.isConfirmed).length;
  const leftovers = draft.filter(r => isAttending(r.status) && !r.isConfirmed).length;
  // Unticking puts back what the player answered (ticking a TENTATIVE made it IN).
  const original = (row: RosterRow) => rows.find(r => r.characterId === row.characterId)!;
  const toggle = (row: RosterRow, on: boolean) => setDraft(list => list.map(r => {
    if (r.characterId !== row.characterId) return r;
    return on || original(r).isConfirmed ? confirmRow(r, on) : original(r);
  }));

  // ponytail: no focus trap; the backdrop covers the page. Native <dialog> if a second modal needs one.
  return (
    <div className="modal-backdrop" onKeyDown={e => { if (e.key === 'Escape' && !busy) onCancel(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="publish-title" className="modal stack">
        <h2 id="publish-title">Publish the roster</h2>
        {withNotes.length > 0 && (
          <section className="stack" aria-labelledby="publish-notes">
            <h3 id="publish-notes">Answers with a note</h3>
            <ul className="plain-list stack" aria-label="Answers with a note">
              {withNotes.map(r => (
                <li key={r.characterId}>
                  <label className="check">
                    <input type="checkbox" checked={isAttending(r.status) && r.isConfirmed} onChange={e => toggle(r, e.target.checked)}
                      aria-label={`Confirm ${r.name}`} aria-describedby={`note-${r.characterId}`} />
                    <CharacterName name={r.name} classId={r.class} /> <span className="muted">{r.status}</span>
                  </label>
                  <span id={`note-${r.characterId}`} className="person-note">{r.note}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {leftovers > 0 && (
          <div role="radiogroup" aria-labelledby="publish-leftovers" className="actions">
            <span id="publish-leftovers">{leftovers} not confirmed go to</span>
            {(['BENCH', 'OUT'] as const).map(option => (
              <label key={option} className="check">
                <input type="radio" name="leftovers" checked={to === option} onChange={() => setTo(option)} />
                {option === 'BENCH' ? 'Bench' : 'Out'}
              </label>
            ))}
          </div>
        )}
        <p>Post the roster of {confirmed} player{confirmed === 1 ? '' : 's'} to the channel?</p>
        <div className="actions">
          <button type="button" className="primary" disabled={busy || confirmed === 0} onClick={() => onPublish(sendUnconfirmed(draft, to))}>
            {busy ? 'Publishing…' : 'Yes, publish'}
          </button>
          {/* Focus starts on Cancel: a stray Enter must not publish. */}
          <button type="button" autoFocus disabled={busy} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
