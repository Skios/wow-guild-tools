import { useState, type FormEvent } from 'react';
import { useApi } from '../context';
import { errorMessage } from '../useAsync';

export function LoginView({ onLogin }: { onLogin: (key: string) => void }) {
  const api = useApi();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const candidate = key.trim();
    if (!candidate || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.checkKey(candidate);
      onLogin(candidate);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="card" onSubmit={submit}>
        <h1>Guild Raid Admin</h1>
        <p className="muted">Officers only. Enter the API key to continue.</p>
        <label htmlFor="api-key">API key</label>
        <input
          id="api-key"
          type="password"
          autoComplete="off"
          value={key}
          onChange={e => setKey(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'login-error' : undefined}
        />
        {error && <p id="login-error" role="alert" className="error">{error}</p>}
        <button type="submit" className="primary" disabled={!key.trim() || busy}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
