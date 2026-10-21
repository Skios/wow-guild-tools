import { useState, type FormEvent } from 'react';
import { nicknameToEmail, type AuthClient } from '../auth';

const WRONG_NICKNAME = 'Nicknames are 3 to 24 characters: letters, numbers, dot, dash or underscore.';
const WRONG_CREDENTIALS = 'Wrong nickname or password.';
const UNREACHABLE = 'Could not reach the sign-in service. Try again in a moment.';

export function Login({ auth }: { auth: AuthClient }) {
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; field?: 'nickname' } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const email = nicknameToEmail(nickname);
    if (!nickname.trim() || !password) return setError({ text: 'Enter your nickname and password.' });
    if (!email) return setError({ text: WRONG_NICKNAME, field: 'nickname' });

    setError(null);
    setBusy(true);
    let failure: string | null = null;
    try {
      const { error: authError } = await auth.signInWithPassword({ email, password });
      if (authError) failure = authError.status === 400 ? WRONG_CREDENTIALS : UNREACHABLE;
    } catch {
      failure = UNREACHABLE;
    }
    // On success the session listener swaps this screen out, so there is nothing left to update.
    if (failure) {
      setError({ text: failure });
      setBusy(false);
    }
  }

  return (
    <main className="page login">
      <form className="card stack" onSubmit={submit} noValidate>
        <h1>Guild Raid Admin</h1>
        <p className="muted">Officers only. Sign in with your nickname.</p>
        <div>
          <label htmlFor="nickname">Nickname</label>
          <input
            id="nickname" value={nickname} onChange={e => setNickname(e.target.value)} disabled={busy}
            autoComplete="username" autoCapitalize="none" spellCheck={false}
            aria-invalid={error?.field === 'nickname' || undefined}
          />
          <label htmlFor="password">Password</label>
          <input
            id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy}
            autoComplete="current-password"
          />
        </div>
        {error && <p role="alert" className="error">{error.text}</p>}
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}
