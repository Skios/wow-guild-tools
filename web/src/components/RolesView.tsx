'use client';

import { useState, type FormEvent } from 'react';
import { useApi, useOfficer } from '../context';
import type { RoleInput, SiteRoleSummary } from '../types';
import { errorMessage, useAsync } from '../useAsync';
import { PencilIcon, XIcon } from './icons';

// Plain words for the capabilities the code registers today; a new one shows by its name until it gets a label.
const LABEL: Record<string, string> = {
  'accounts.manage': 'Give roles and reset passwords',
  'events.manage': 'Create and manage events',
  'messages.send': 'Message players',
  'roster.approve': 'Approve characters for the roster',
  'roster.manage': 'Edit the roster',
};
const label = (capability: string) => LABEL[capability] ?? capability;

type Errors = Partial<Record<'name' | 'position', string>>;

function validate(name: string, position: string): Errors {
  const errors: Errors = {};
  if (name.trim().length < 2 || name.trim().length > 32) errors.name = 'Role name: 2-32 characters';
  const rank = Number(position);
  if (!Number.isInteger(rank) || rank < 1 || rank > 1000) errors.position = 'Rank: 1 or more (0 is the Owner), up to 1000';
  return errors;
}

function RoleForm({ title, submitLabel, initial, capabilities, onSubmit, onCancel }: {
  title: string; submitLabel: string; initial: RoleInput; capabilities: string[];
  onSubmit: (role: RoleInput) => Promise<void>; onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [position, setPosition] = useState(String(initial.position));
  // A stored capability the code no longer knows is dropped on save (it grants nothing anyway).
  const [chosen, setChosen] = useState(() => new Set(initial.capabilities.filter(c => capabilities.includes(c))));
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (capability: string, on: boolean) => setChosen(set => {
    const next = new Set(set);
    if (on) next.add(capability); else next.delete(capability);
    return next;
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problems = validate(name, position);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    setFailure(null);
    try {
      await onSubmit({ name: name.trim(), position: Number(position), capabilities: capabilities.filter(c => chosen.has(c)) });
    } catch (e) {
      setFailure(errorMessage(e));
    }
    setBusy(false);
  };

  return (
    <form className="card stack" aria-label={title} onSubmit={submit} noValidate>
      <h3>{title}</h3>
      <div className="grid">
        <div>
          <label htmlFor="role-name">Name</label>
          <input
            id="role-name" value={name} onChange={e => setName(e.target.value)} autoFocus
            aria-invalid={!!errors.name} aria-describedby={errors.name ? 'role-name-error' : undefined}
          />
          {errors.name && <p id="role-name-error" role="alert" className="error">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor="role-rank">Rank (lower = higher; the Owner is 0)</label>
          <input
            id="role-rank" type="number" min={1} max={1000} value={position} onChange={e => setPosition(e.target.value)}
            aria-invalid={!!errors.position} aria-describedby={errors.position ? 'role-rank-error' : undefined}
          />
          {errors.position && <p id="role-rank-error" role="alert" className="error">{errors.position}</p>}
        </div>
      </div>
      <fieldset className="capabilities">
        <legend>What it can do</legend>
        {capabilities.map(c => (
          <label key={c} className="check">
            <input type="checkbox" checked={chosen.has(c)} onChange={e => toggle(c, e.target.checked)} />
            {' '}{label(c)} <code className="muted" aria-hidden="true">{c}</code>
          </label>
        ))}
      </fieldset>
      {failure && <p role="alert" className="error">{failure}</p>}
      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>{submitLabel}</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/** The Owner's page: create, edit and delete roles; capabilities come from the code (GET /roles/capabilities). */
export function RolesView() {
  if (!useOfficer().isOwner) return <p className="card muted">Only the Owner configures roles.</p>;
  return <Roles />;
}

function Roles() {
  const api = useApi();
  const roles = useAsync(() => api.listRoles(), [api]);
  const capabilities = useAsync(() => api.roleCapabilities(), [api]);
  const [editing, setEditing] = useState<SiteRoleSummary | 'new' | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sorted = [...(roles.data ?? [])].sort((a, b) => a.position - b.position);
  const lowest = Math.max(0, ...sorted.filter(r => !r.isDefault).map(r => r.position));
  const ready = capabilities.data !== null;

  const done = (text: string) => { setProblem(null); setNotice(text); roles.reload(); };
  const saved = (text: string) => { setEditing(null); done(text); };
  const open = (target: SiteRoleSummary | 'new') => { setNotice(null); setProblem(null); setEditing(target); };
  const remove = async (role: SiteRoleSummary) => {
    setConfirming(null);
    setProblem(null);
    setNotice(null);
    try {
      await api.deleteRole(role.id);
      if (editing !== 'new' && editing?.id === role.id) setEditing(null); // another role's open form stays
      done(`${role.name} deleted.`);
    } catch (e) {
      setProblem(errorMessage(e));
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <h2>Roles</h2>
        <p className="muted">
          What each role can do and its rank. People give roles equal to or below their own, to people below them.
          New accounts get the default role.
        </p>
      </section>

      {notice && <p className="notice" role="status">{notice}</p>}
      {(problem || roles.error || capabilities.error) && <p role="alert" className="error">{problem ?? roles.error ?? capabilities.error}</p>}

      {editing && capabilities.data && (
        editing === 'new' ? (
          <RoleForm
            title="New role" submitLabel="Create role" capabilities={capabilities.data}
            initial={{ name: '', position: Math.min(1000, lowest + 5), capabilities: [] }}
            onSubmit={async role => { await api.createRole(role); saved(`${role.name} created.`); }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <RoleForm
            key={editing.id} title={`Edit ${editing.name}`} submitLabel="Save role" capabilities={capabilities.data}
            initial={editing}
            onSubmit={async role => { await api.updateRole(editing.id, role); saved(`${role.name} saved.`); }}
            onCancel={() => setEditing(null)}
          />
        )
      )}

      <section className="card" aria-label="All roles">
        {roles.loading && !roles.data && <p className="muted" role="status">Loading roles…</p>}
        {sorted.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Role</th><th scope="col">Rank</th><th scope="col">What it can do</th>
                <th scope="col">Accounts</th><th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(role => (
                <tr key={role.id}>
                  <td><strong>{role.name}</strong></td>
                  <td className="muted">{role.position}</td>
                  <td>
                    {role.isOwner ? 'Everything' : role.capabilities.length === 0 ? <span className="muted">Profile only</span> : (
                      <ul className="chips">{role.capabilities.map(c => <li key={c} title={c}>{label(c)}</li>)}</ul>
                    )}
                  </td>
                  <td><span>{role.users}</span>{role.isDefault && <>{' '}<span className="badge">Default</span></>}</td>
                  <td className="cell-actions">
                    {!role.isOwner && (confirming === role.id ? (
                      <span className="actions compact" role="group" aria-label={`Confirm deleting ${role.name}`}>
                        <span>Delete {role.name}?</span>
                        <button type="button" className="danger" autoFocus onClick={() => void remove(role)}>Yes</button>
                        <button type="button" onClick={() => setConfirming(null)}>Cancel</button>
                      </span>
                    ) : (
                      <span className="actions compact">
                        <button type="button" className="icon-button" disabled={!ready} onClick={() => open(role)} aria-label={`Edit ${role.name}`} title="Edit"><PencilIcon /></button>
                        {!role.isDefault && (
                          <button
                            type="button" className="icon-button" onClick={() => setConfirming(role.id)} aria-label={`Delete ${role.name}`}
                            disabled={role.users > 0} title={role.users > 0 ? `Give its ${role.users} accounts another role first` : 'Delete'}
                          ><XIcon /></button>
                        )}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="actions"><button type="button" disabled={!ready} onClick={() => open('new')}>New role</button></div>
      </section>
    </div>
  );
}
