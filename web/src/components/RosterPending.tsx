import { useState } from 'react';
import { useMeta, useSpecLabel } from '../context';
import type { RosterAccount, RosterCharacter } from '../types';
import { CharacterName } from './CharacterName';
import { XIcon } from './icons';
import { SpecIcon } from './SpecIcon';

/** "Assign to…": give a character to another account. */
export function AssignSelect({ person, accounts, busy, onAssign }: {
  person: RosterCharacter; accounts: RosterAccount[]; busy: boolean; onAssign: (account: RosterAccount) => void;
}) {
  if (accounts.length === 0) return null;
  return (
    <select
      aria-label={`Assign ${person.name} to an account`} value="" disabled={busy}
      onChange={e => { const a = accounts.find(x => x.id === e.target.value); if (a) onAssign(a); }}
    >
      <option value="">Assign to…</option>
      {accounts.map(a => <option key={a.id} value={a.id}>{a.nickname ? `${a.nickname} (${a.username})` : a.username}</option>)}
    </select>
  );
}

function PendingRow({ person, accounts, busy, onApprove, onReject, onAssign }: {
  person: RosterCharacter; accounts: RosterAccount[]; busy: boolean;
  onApprove: () => void; onReject: () => void; onAssign: (account: RosterAccount) => void;
}) {
  const [asking, setAsking] = useState(false);
  const spec = useSpecLabel(person.class, person.spec);
  const className = useMeta().classes.find(c => c.id === person.class)?.label ?? person.class;
  return (
    <tr>
      <td><span className="role-cell"><SpecIcon classId={person.class} spec={person.spec} role={person.role} /><CharacterName name={person.name} classId={person.class} /></span></td>
      <td className="muted">{person.realm}</td>
      <td>{[spec, className].filter(Boolean).join(' ')}</td>
      <td>{person.nickname ?? person.username}</td>
      <td>
        {asking ? (
          <span className="actions compact" role="group" aria-label={`Confirm rejecting ${person.name}`}>
            <span>Reject {person.name}? It leaves the player&apos;s account.</span>
            <button type="button" className="danger" disabled={busy} onClick={onReject}>Yes</button>
            <button type="button" disabled={busy} onClick={() => setAsking(false)}>Cancel</button>
          </span>
        ) : (
          <span className="actions compact">
            <button type="button" className="primary" disabled={busy} onClick={onApprove} aria-label={`Approve ${person.name}`}>Approve</button>
            <button type="button" className="icon-button" disabled={busy} onClick={() => setAsking(true)} aria-label={`Reject ${person.name}`} title="Reject"><XIcon /></button>
            <AssignSelect person={person} accounts={accounts} busy={busy} onAssign={onAssign} />
          </span>
        )}
      </td>
    </tr>
  );
}

/** Characters players added, waiting for an officer or raid leader to put them on the roster. */
export function PendingList({ people, ...actions }: {
  people: RosterCharacter[]; accounts: RosterAccount[]; busy: boolean;
  onApprove: (person: RosterCharacter) => void;
  onReject: (person: RosterCharacter) => void;
  onAssign: (person: RosterCharacter, account: RosterAccount) => void;
}) {
  if (people.length === 0) return null;
  return (
    <section className="card" aria-label="Waiting for approval">
      <h3>Waiting for approval <span className="count">{people.length}</span></h3>
      <p className="muted">Characters players added themselves. Only approved characters can answer events.</p>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Character</th><th scope="col">Realm</th><th scope="col">Class</th>
            <th scope="col">Player</th><th scope="col"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {people.map(person => (
            <PendingRow
              key={person.id}
              person={person}
              accounts={actions.accounts}
              busy={actions.busy}
              onApprove={() => actions.onApprove(person)}
              onReject={() => actions.onReject(person)}
              onAssign={account => actions.onAssign(person, account)}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

const CONFIRM_TEXT = 'NEW SEASON';

/** Empties the roster: players' characters go back to waiting for approval. Asks for the words typed out. */
export function NewSeason({ busy, onStart }: { busy: boolean; onStart: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const close = () => { setOpen(false); setTyped(''); };
  return (
    <section className="card" aria-label="New season">
      <h3>New season</h3>
      <p className="muted">
        Empties the roster. Players keep their characters, which wait for approval again; empty unclaimed names are
        deleted. Past events stay as they are.
      </p>
      {open ? (
        <div className="actions">
          <label htmlFor="new-season-confirm">Type {CONFIRM_TEXT} to confirm</label>
          <input id="new-season-confirm" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" />
          <button type="button" className="danger" disabled={busy || typed !== CONFIRM_TEXT} onClick={() => { onStart(); close(); }}>
            Empty the roster
          </button>
          <button type="button" onClick={close}>Cancel</button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)}>Start a new season…</button>
      )}
    </section>
  );
}
