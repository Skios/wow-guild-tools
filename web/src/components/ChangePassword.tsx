'use client';

import { useState, type FormEvent } from 'react';
import { ApiError } from '../api';
import { nicknameToEmail, type AuthClient } from '../auth';
import { useApi } from '../context';
import { passwordProblem } from '../password';
import { PasswordChecklist } from './PasswordChecklist';

// The read-only username field tells Chrome which saved login the new password belongs to.
export function ChangePassword({ auth, username, forced, onDone }: {
  auth: AuthClient; username: string; forced: boolean; onDone: () => void;
}) {
  const api = useApi();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const problem = !current ? `Enter your ${forced ? 'temporary' : 'current'} password.`
      : passwordProblem(password, username)
      ?? (password !== confirm ? 'The passwords do not match.' : null)
      ?? (password === current ? 'Choose a different password from the current one.' : null);
    if (problem) return setError(problem);

    setError(null);
    setBusy(true);
    try {
      await api.changePassword(current, password);
    } catch (failure) {
      setBusy(false);
      return setError(failure instanceof ApiError ? failure.message : 'Could not change the password. Try again.');
    }
    // A password change can end the other sessions; a fresh sign-in keeps this one going.
    const email = nicknameToEmail(username);
    if (email) await auth.signInWithPassword({ email, password }).catch(() => undefined);
    onDone();
  }

  return (
    <section className="card stack">
      <h1>Change password</h1>
      {forced && <p>You signed in with a temporary password. Choose your own to continue.</p>}
      <form className="stack" method="post" action="/account" onSubmit={submit} noValidate>
        <div>
          <label htmlFor="cp-username">Nickname</label>
          <input id="cp-username" name="username" value={username} readOnly autoComplete="username" />
          <label htmlFor="cp-current">{forced ? 'Temporary password' : 'Current password'}</label>
          <input id="cp-current" name="current-password" type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" />
          <label htmlFor="cp-password">New password</label>
          <input id="cp-password" name="password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
          <PasswordChecklist password={password} nickname={username} />
          <label htmlFor="cp-confirm">Repeat new password</label>
          <input id="cp-confirm" name="confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
        </div>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
      </form>
    </section>
  );
}
