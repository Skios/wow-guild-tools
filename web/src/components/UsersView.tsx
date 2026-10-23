'use client';

import { useState } from 'react';
import { useApi } from '../context';
import type { Account, Officer, SiteRoleSummary } from '../types';
import { errorMessage, useAsync } from '../useAsync';

// Mirrors the API rules (src/domain/roles.ts); the API decides, this only hides what would be refused.
const canManage = (me: Officer, target: Account) =>
  target.id !== me.userId && (me.isOwner || !target.role || (!target.role.isOwner && target.role.position > me.position));
const canGive = (me: Officer, role: SiteRoleSummary) =>
  me.isOwner || (!role.isOwner && role.position >= me.position && role.capabilities.every(c => me.capabilities.includes(c)));

export function UsersView({ me }: { me: Officer }) {
  const api = useApi();
  const data = useAsync(() => Promise.all([api.listUsers(), api.listRoles()]), [api]);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);

  async function changeRole(user: Account, roleId: string) {
    setError(null);
    try {
      await api.setUserRole(user.id, roleId);
    } catch (failure) {
      setError(errorMessage(failure));
    }
    data.reload();
  }

  async function reset(user: Account) {
    setConfirming(null);
    setError(null);
    try {
      setIssued({ username: user.username, password: (await api.resetUserPassword(user.id)).password });
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  if (data.error) {
    return <p role="alert" className="error">Could not load accounts: {data.error} <button type="button" onClick={data.reload}>Retry</button></p>;
  }
  if (!data.data) return <p className="muted" role="status">Loading…</p>;
  const [users, roles] = data.data;
  const givable = roles.filter(r => canGive(me, r));

  return (
    <section className="stack">
      <h1>Users</h1>
      {error && <p role="alert" className="error">{error}</p>}
      {issued && (
        <p role="status" className="card">
          Temporary password for <strong>{issued.username}</strong>: <code>{issued.password}</code>. Give it to them privately:
          it is shown only once, and they must choose their own when they sign in.
        </p>
      )}
      <table>
        <thead><tr><th>Nickname</th><th>Role</th><th>Characters</th><th /></tr></thead>
        <tbody>
          {users.map(user => {
            const manageable = canManage(me, user);
            return (
              <tr key={user.id}>
                <td>{user.username}</td>
                <td>
                  {manageable ? (
                    <select aria-label={`Role of ${user.username}`} value={user.role?.id ?? ''} onChange={e => void changeRole(user, e.target.value)}>
                      {!user.role && <option value="">(none)</option>}
                      {user.role && !givable.some(r => r.id === user.role!.id) && <option value={user.role.id} disabled>{user.role.name}</option>}
                      {givable.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  ) : (user.role?.name ?? '(none)')}
                </td>
                <td className="muted">{user.characters.map(c => c.name).join(', ')}</td>
                <td>
                  {manageable && (confirming === user.id ? (
                    <>
                      <button type="button" className="danger" onClick={() => void reset(user)}>Confirm reset</button>
                      <button type="button" onClick={() => setConfirming(null)}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfirming(user.id)}>Reset password</button>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
