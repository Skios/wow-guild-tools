import { useMemo, useState } from 'react';
import { useApi, useMeta, useOfficer, useRoleLabel, useSpecLabel } from '../context';
import { ROLES, ROLE_ORDER } from '../roster';
import { errorMessage, useAsync } from '../useAsync';
import type { RosterAccount, RosterCharacter, RosterEntryInput } from '../types';
import { CharacterName } from './CharacterName';
import { InviteMacros } from './InviteMacros';
import { OffSpecs } from './OffSpecs';
import { RoleIcon } from './RoleIcon';
import { RosterForm } from './RosterForm';
import { AssignSelect, NewSeason, PendingList } from './RosterPending';
import { SpecIcon } from './SpecIcon';

const LAST_REALM_KEY = 'guild-admin-last-realm';
const lastRealm = () => { try { return localStorage.getItem(LAST_REALM_KEY) ?? ''; } catch { return ''; } };
const rememberRealm = (realm: string) => { try { localStorage.setItem(LAST_REALM_KEY, realm); } catch { /* optional */ } };

type Pending = { id: string; kind: 'remove' | 'release' | 'revoke' };

const QUESTION: Record<Pending['kind'], (name: string) => string> = {
  remove: name => `Remove ${name} from the roster?`,
  release: name => `Free ${name} so another player can take it?`,
  revoke: name => `Take ${name} off the roster? The player keeps it and it waits for approval again.`,
};
const DONE: Record<Pending['kind'], (name: string) => string> = {
  remove: name => `${name} removed from the roster.`,
  release: name => `${name} is free to be claimed again.`,
  revoke: name => `${name} is waiting for approval again.`,
};

/** Each player's characters together (main first, alts after), players by their first character's role, then name. */
function byPlayer(people: RosterCharacter[]): { person: RosterCharacter; alt: boolean }[] {
  const groups = new Map<string, RosterCharacter[]>();
  for (const p of people) {
    const key = p.claimed ? `player:${p.username}` : `slot:${p.id}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const order = (a: RosterCharacter, b: RosterCharacter) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name);
  return [...groups.values()]
    .map(list => [...list].sort((a, b) => Number(b.isMain) - Number(a.isMain) || order(a, b)))
    .sort((a, b) => order(a[0]!, b[0]!))
    .flatMap(list => list.map((person, i) => ({ person, alt: i > 0 })));
}

function Row({ person, alt, canEdit, editing, pending, busy, accounts, onAssign, onEdit, onAsk, onConfirm, onCancel, onSave }: {
  person: RosterCharacter;
  alt: boolean;
  canEdit: boolean;
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
            initial={{ name: person.name, realm: person.realm, class: person.class, spec: person.spec ?? '', offSpecs: person.offSpecs, nickname: person.claimed ? '' : person.nickname ?? '' }}
            submitLabel="Save changes"
            onSubmit={onSave}
            onCancel={onCancel}
            hideNickname={person.claimed}
          />
        </td>
      </tr>
    );
  }
  return (
    <tr className={alt ? 'alt-row' : undefined}>
      <td><span className="role-cell"><SpecIcon classId={person.class} spec={person.spec} role={person.role} /><OffSpecs classId={person.class} offSpecs={person.offSpecs} /><CharacterName name={person.name} classId={person.class} nickname={person.claimed ? null : person.nickname} /></span></td>
      <td className="muted">{person.realm}</td>
      <td>{[spec, className].filter(Boolean).join(' ')}</td>
      <td><span className="role-cell"><RoleIcon role={person.role} /><span className="role-label">{role}</span></span></td>
      <td>
        {person.claimed
          ? <span>{person.nickname ?? person.username}</span>
          : (
            <span className="role-cell">
              <span className="badge badge-open" title="Nobody has linked this name yet">Waiting for a player</span>
              <AssignSelect person={person} accounts={accounts} busy={busy} onAssign={onAssign} />
            </span>
          )}
      </td>
      <td>
        {mine ? (
          <span className="actions compact" role="group" aria-label={`Confirm for ${person.name}`}>
            <span>{QUESTION[mine.kind](person.name)}</span>
            <button type="button" className="danger" disabled={busy} onClick={onConfirm}>Yes</button>
            <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
          </span>
        ) : (
          <span className="actions compact">
            {canEdit && <button type="button" onClick={onEdit} aria-label={`Edit ${person.name}`}>Edit</button>}
            {person.claimed && canEdit && <button type="button" onClick={() => onAsk('release')} aria-label={`Release ${person.name}`}>Release</button>}
            {person.claimed && <button type="button" onClick={() => onAsk('revoke')} aria-label={`Revoke ${person.name}`}>Revoke</button>}
            {!person.claimed && canEdit && <button type="button" onClick={() => onAsk('remove')} aria-label={`Remove ${person.name}`}>Remove</button>}
          </span>
        )}
      </td>
    </tr>
  );
}

export function RosterView() {
  const api = useApi();
  const meta = useMeta();
  // Raid leaders approve and revoke; editing the roster needs roster.manage.
  const canEdit = useOfficer().capabilities.includes('roster.manage');
  const roster = useAsync(() => api.listRoster(), [api]);
  const waiting = useAsync(() => api.listPendingRoster(), [api]);
  const accounts = useAsync(() => (canEdit ? api.rosterAccounts() : Promise.resolve([])), [api, canEdit]);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const people = roster.data ?? [];
  const rows = useMemo(() => byPlayer(people), [people]);
  const claimed = people.filter(p => p.claimed).length;
  const byRole = ROLES.map(role => ({ role, count: people.filter(p => p.role === role).length }));

  async function act<T>(action: () => Promise<T>, done: (result: T) => string) {
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      setNotice(done(await action()));
      setPending(null);
      setEditing(null);
      roster.reload();
      waiting.reload();
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const assign = (person: RosterCharacter, account: RosterAccount) =>
    act(() => api.assignRosterOwner(person.id, account.id), () => `${person.name} is now ${account.nickname ?? account.username}’s.`);

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
          The standing roster: everyone here is invited to every event. Players claim their name or add their characters
          on their profile; characters they add wait for approval.
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

      <PendingList
        people={waiting.data ?? []}
        accounts={accounts.data ?? []}
        busy={busy}
        onApprove={person => act(() => api.approveRoster(person.id), () => `${person.name} is on the roster.`)}
        onReject={person => act(() => api.rejectPending(person.id), () => `${person.name} rejected.`)}
        onAssign={assign}
      />

      <section className="card" aria-label="Roster characters">
        {roster.loading && !roster.data && <p className="muted" role="status">Loading the roster…</p>}
        {roster.data && people.length === 0 && <p className="muted">The roster is empty.{canEdit && ' Add the first character below.'}</p>}
        {rows.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Character</th><th scope="col">Realm</th><th scope="col">Class</th>
                <th scope="col">Role</th><th scope="col">Player</th><th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ person, alt }) => (
                <Row
                  key={person.id}
                  person={person}
                  alt={alt}
                  canEdit={canEdit}
                  editing={editing === person.id}
                  pending={pending}
                  busy={busy}
                  accounts={accounts.data ?? []}
                  onAssign={account => assign(person, account)}
                  onEdit={() => { setEditing(person.id); setPending(null); setNotice(null); }}
                  onAsk={kind => { setPending({ id: person.id, kind }); setEditing(null); }}
                  onCancel={() => { setPending(null); setEditing(null); }}
                  onConfirm={() => {
                    const kind = pending!.kind;
                    const call = { remove: api.removeFromRoster, release: api.releaseRosterEntry, revoke: api.revokeRoster }[kind];
                    return act(() => call(person.id), () => DONE[kind](person.name));
                  }}
                  onSave={async entry => { await api.updateRosterEntry(person.id, entry); setEditing(null); setNotice(`${entry.name} updated.`); roster.reload(); }}
                />
              ))}
            </tbody>
          </table>
        )}
      </section>

      <InviteMacros people={rows.map(r => r.person)} />

      {canEdit && (
        <section className="card" aria-label="Add to the roster">
          <h3>Add a character</h3>
          <RosterForm
            initial={{ name: '', realm: lastRealm(), class: '', spec: '', offSpecs: [], nickname: '' }}
            submitLabel="Add to roster"
            onSubmit={add}
            keepAfterSave={['realm']}
          />
        </section>
      )}

      {canEdit && (
        <NewSeason
          busy={busy}
          onStart={() => act(
            () => api.newSeason(),
            ({ removed }) => `New season started: ${removed} characters left the roster. Approve them again as players come back.`,
          )}
        />
      )}
    </div>
  );
}
