import { useMemo, useState } from 'react';
import { useApi, useMeta, useRoleLabel, useSpecLabel } from '../context';
import { ROLES, ROLE_ORDER } from '../roster';
import { errorMessage, useAsync } from '../useAsync';
import type { RosterAccount, RosterCharacter, RosterEntryInput } from '../types';
import { CharacterName } from './CharacterName';
import { OffSpecs } from './OffSpecs';
import { RoleIcon } from './RoleIcon';
import { RosterForm } from './RosterForm';
import { SpecIcon } from './SpecIcon';

const LAST_REALM_KEY = 'guild-admin-last-realm';
const lastRealm = () => { try { return localStorage.getItem(LAST_REALM_KEY) ?? ''; } catch { return ''; } };
const rememberRealm = (realm: string) => { try { localStorage.setItem(LAST_REALM_KEY, realm); } catch { /* optional */ } };

type Pending = { id: string; kind: 'remove' | 'release' };

function Row({ person, editing, pending, busy, accounts, onAssign, onEdit, onAsk, onConfirm, onCancel, onSave }: {
  person: RosterCharacter;
  accounts: RosterAccount[];
  onAssign: (account: RosterAccount) => void;
  editing: boolean;
  pending: Pending | null;
  busy: boolean;
  onEdit: () => void;
  onAsk: (kind: Pending['kind']) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onSave: (entry: RosterEntryInput) => Promise<void>;
}) {
  const role = useRoleLabel(person.role);
  const spec = useSpecLabel(person.class, person.spec);
  const className = useMeta().classes.find(c => c.id === person.class)?.label ?? person.class;
  const mine = pending?.id === person.id ? pending : null;

  if (editing) {
    return (
      <tr>
        <td colSpan={6}>
          <RosterForm
            initial={{ name: person.name, realm: person.realm, class: person.class, spec: person.spec ?? '', offSpecs: person.offSpecs, nickname: person.nickname ?? '' }}
            submitLabel="Save changes"
            onSubmit={onSave}
            onCancel={onCancel}
          />
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td><span className="role-cell"><SpecIcon classId={person.class} spec={person.spec} role={person.role} /><OffSpecs classId={person.class} offSpecs={person.offSpecs} /><CharacterName name={person.name} classId={person.class} nickname={person.nickname} /></span></td>
      <td className="muted">{person.realm}</td>
      <td>{[spec, className].filter(Boolean).join(' ')}</td>
      <td><span className="role-cell"><RoleIcon role={person.role} /><span className="role-label">{role}</span></span></td>
      <td>
        {person.claimed
          ? <span>@{person.username}</span>
          : (
            <span className="role-cell">
              <span className="badge badge-open" title="Nobody has linked this name yet">Waiting for a player</span>
              {accounts.length > 0 && (
                <select
                  aria-label={`Assign ${person.name} to an account`} value="" disabled={busy}
                  onChange={e => { const a = accounts.find(x => x.id === e.target.value); if (a) onAssign(a); }}
                >
                  <option value="">Assign to…</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.nickname ? `${a.nickname} (${a.username})` : a.username}</option>)}
                </select>
              )}
            </span>
          )}
      </td>
      <td>
        {mine ? (
          <span className="actions compact" role="group" aria-label={`Confirm for ${person.name}`}>
            <span>{mine.kind === 'remove'
              ? `Remove ${person.name} from the roster?${person.claimed ? ' The player keeps their character.' : ''}`
              : `Free ${person.name} so another player can take it?`}</span>
            <button type="button" className="danger" disabled={busy} onClick={onConfirm}>Yes</button>
            <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
          </span>
        ) : (
          <span className="actions compact">
            <button type="button" onClick={onEdit} aria-label={`Edit ${person.name}`}>Edit</button>
            {person.claimed && <button type="button" onClick={() => onAsk('release')} aria-label={`Release ${person.name}`}>Release</button>}
            <button type="button" onClick={() => onAsk('remove')} aria-label={`Remove ${person.name}`}>Remove</button>
          </span>
        )}
      </td>
    </tr>
  );
}

export function RosterView() {
  const api = useApi();
  const meta = useMeta();
  const roster = useAsync(() => api.listRoster(), [api]);
  const accounts = useAsync(() => api.rosterAccounts(), [api]);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const people = roster.data ?? [];
  const sorted = useMemo(
    () => [...people].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name)),
    [people],
  );
  const claimed = people.filter(p => p.claimed).length;
  const byRole = ROLES.map(role => ({ role, count: people.filter(p => p.role === role).length }));

  async function act(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      await action();
      setNotice(done);
      setPending(null);
      setEditing(null);
      roster.reload();
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const add = async (entry: RosterEntryInput) => {
    await api.addToRoster(entry);
    rememberRealm(entry.realm);
    setNotice(`${entry.name} added to the roster.`);
    roster.reload();
  };

  return (
    <div className="stack">
      <section className="card">
        <h2>Raid roster</h2>
        <p className="muted">
          The standing roster: everyone here is invited to every event. Players claim their name on their profile, or you
          assign it to their account here.
        </p>
        <ul className="summary" aria-label="Roster totals">
          <li><strong>{people.length}</strong> characters</li>
          <li><strong>{claimed}</strong> linked to a player</li>
          <li><strong>{people.length - claimed}</strong> waiting</li>
          {byRole.map(({ role, count }) => <li key={role} title={meta.roles.find(r => r.id === role)?.label}><RoleIcon role={role} /> {count}</li>)}
        </ul>
      </section>

      {notice && <p className="notice" role="status">{notice}</p>}
      {(problem || roster.error) && <p role="alert" className="error">{problem ?? roster.error}</p>}

      <section className="card" aria-label="Roster characters">
        {roster.loading && !roster.data && <p className="muted" role="status">Loading the roster…</p>}
        {roster.data && people.length === 0 && <p className="muted">The roster is empty. Add the first character below.</p>}
        {sorted.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Character</th><th scope="col">Realm</th><th scope="col">Class</th>
                <th scope="col">Role</th><th scope="col">Player</th><th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(person => (
                <Row
                  key={person.id}
                  person={person}
                  editing={editing === person.id}
                  pending={pending}
                  busy={busy}
                  accounts={accounts.data ?? []}
                  onAssign={account => act(() => api.assignRosterOwner(person.id, account.id), `${person.name} is now ${account.nickname ?? account.username}’s.`)}
                  onEdit={() => { setEditing(person.id); setPending(null); setNotice(null); }}
                  onAsk={kind => { setPending({ id: person.id, kind }); setEditing(null); }}
                  onCancel={() => { setPending(null); setEditing(null); }}
                  onConfirm={() => act(
                    () => (pending?.kind === 'release' ? api.releaseRosterEntry(person.id) : api.removeFromRoster(person.id)),
                    pending?.kind === 'release' ? `${person.name} is free to be claimed again.` : `${person.name} removed from the roster.`,
                  )}
                  onSave={async entry => { await api.updateRosterEntry(person.id, entry); setEditing(null); setNotice(`${entry.name} updated.`); roster.reload(); }}
                />
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card" aria-label="Add to the roster">
        <h3>Add a character</h3>
        <RosterForm
          initial={{ name: '', realm: lastRealm(), class: '', spec: '', offSpecs: [], nickname: '' }}
          submitLabel="Add to roster"
          onSubmit={add}
          keepAfterSave={['realm']}
        />
      </section>
    </div>
  );
}
