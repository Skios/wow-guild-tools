import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { nicknameToEmail, type AuthClient } from '../auth';

const WRONG_NICKNAME = 'Nicknames are 3 to 24 characters: letters, numbers, dot, dash or underscore.';
const UNREACHABLE = 'Could not reach the sign-in service. Try again in a moment.';

// Unknown nickname and wrong password get the same answer on purpose.
function failureMessage(status: number | undefined): string {
  if (status === 400) return 'Wrong nickname or password.';
  if (status === 429) return 'Too many attempts. Wait a minute and try again.';
  return status ? 'Sign-in failed. Try again.' : UNREACHABLE; // supabase-js reports network failures with status 0 or none
}

export function Login({ auth }: { auth: AuthClient }) {
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const nicknameRef = useRef<HTMLInputElement>(null);
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
      if (authError) failure = failureMessage(authError.status);
    } catch {
      failure = UNREACHABLE;
    }
    // On success the session listener swaps this screen out, so there is nothing left to update.
    if (failure) {
      setError({ text: failure });
      setBusy(false);
      nicknameRef.current?.focus();
    }
  }

  return (
    <main className="page login">
      <form className="card stack" method="post" action="/login" onSubmit={submit} noValidate>
        <h1>Guild Raid Admin</h1>
        <p className="muted">Sign in with your nickname.</p>
        <div>
          <label htmlFor="nickname">Nickname</label>
          <input
            id="nickname" value={nickname} onChange={e => setNickname(e.target.value)} ref={nicknameRef}
            autoComplete="username" autoCapitalize="none" spellCheck={false}
            aria-invalid={error?.field === 'nickname' || undefined}
            aria-describedby={error?.field === 'nickname' ? 'login-error' : undefined}
          />
          <label htmlFor="password">Password</label>
          <input
            id="password" type="password" value={password} onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {error && <p id="login-error" role="alert" className="error">{error.text}</p>}
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted">New here? <Link href="/signup">Create an account</Link></p>
        <p className="muted">Forgot your password? Send /reset to the guild&apos;s Telegram bot (once Telegram is linked).</p>
      </form>
    </main>
  );
}
