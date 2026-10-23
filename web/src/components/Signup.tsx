'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ApiError, signupRequest } from '../api';
import { nicknameToEmail, type AuthClient } from '../auth';
import { MIN_LENGTH, passwordProblem } from '../password';

const WRONG_NICKNAME = 'Nicknames are 3 to 24 characters: letters, numbers, dot, dash or underscore.';

type Signup = (username: string, password: string) => Promise<unknown>;

// A real <form method="post"> with username + new-password fields, then a page change on success:
// that is what makes Chrome offer to save the credentials. The submit itself is handled in JS.
export function Signup({ auth, signup = signupRequest }: { auth: AuthClient; signup?: Signup }) {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const name = nickname.trim().toLowerCase();
    const email = nicknameToEmail(name);
    const problem = !email ? WRONG_NICKNAME : passwordProblem(password, name) ?? (password !== confirm ? 'The passwords do not match.' : null);
    if (problem || !email) return setError(problem);

    setError(null);
    setBusy(true);
    try {
      await signup(name, password);
    } catch (failure) {
      setBusy(false);
      return setError(failure instanceof ApiError ? failure.message : 'Could not create the account. Try again.');
    }
    const signedIn = await auth.signInWithPassword({ email, password }).then(({ error: e }) => !e, () => false);
    if (!signedIn) {
      setBusy(false);
      return setError('Your account was created, but signing in failed: go back and sign in.');
    }
    router.replace('/events');
  }

  return (
    <main className="page login">
      <form className="card stack" method="post" action="/signup" onSubmit={submit} noValidate>
        <h1>Create your account</h1>
        <p className="muted">
          Pick a nickname and a password. Nothing personal is asked or stored. Password: at least {MIN_LENGTH} characters,
          with 3 of lowercase, uppercase, digits, symbols.
        </p>
        <div>
          <label htmlFor="nickname">Nickname</label>
          <input
            id="nickname" name="username" value={nickname} onChange={e => setNickname(e.target.value)}
            autoComplete="username" autoCapitalize="none" spellCheck={false}
          />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
          <label htmlFor="confirm">Repeat password</label>
          <input id="confirm" name="confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
        </div>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        <p className="muted">Already have an account? <Link href="/events">Sign in</Link></p>
      </form>
    </main>
  );
}
