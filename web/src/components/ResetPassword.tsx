'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, resetWithLinkRequest } from '../api';
import { passwordProblem } from '../password';
import { PasswordChecklist } from './PasswordChecklist';

type Reset = (token: string, password: string) => Promise<void>;

/** /reset?t=...: the link the bot sends to an account's own Telegram. No sign-in needed. */
export function ResetPassword({ reset = resetWithLinkRequest }: { reset?: Reset }) {
  // Read after mounting: Next prerenders this page on the server, where there is no URL to read. null = not read yet.
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => setToken(new URLSearchParams(window.location.search).get('t') ?? ''), []);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    // The nickname rule is checked by the server, which knows the account.
    const problem = passwordProblem(password, '') ?? (password !== confirm ? 'The passwords do not match.' : null);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    try {
      await reset(token ?? '', password);
      setDone(true);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Could not change the password. Try again.');
    }
    setBusy(false);
  }

  return (
    <main className="page login">
      <div className="card stack">
        <h1>Choose a new password</h1>
        {token === '' && <p role="alert" className="error">This link is incomplete: send /reset to the guild&apos;s Telegram bot for a new one.</p>}
        {done ? (
          <p role="status">Password changed. <Link href="/events">Sign in</Link> with it.</p>
        ) : token && (
          <form className="stack" method="post" action="/reset" onSubmit={submit} noValidate>
            <div>
              <label htmlFor="reset-password">New password</label>
              <input id="reset-password" name="password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
              <PasswordChecklist password={password} nickname="" />
              <label htmlFor="reset-confirm">Repeat new password</label>
              <input id="reset-confirm" name="confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
            </div>
            {error && <p role="alert" className="error">{error}</p>}
            <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Set new password'}</button>
          </form>
        )}
      </div>
    </main>
  );
}
