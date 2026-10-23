'use client';

import { useState } from 'react';
import { useApi } from '../context';
import { forgetLinkToken, pendingLinkToken } from '../telegramLink';
import { errorMessage, useAsync } from '../useAsync';

/**
 * Your Telegram link. A link from the bot (/link?t=...) is applied only after you confirm here:
 * someone else's crafted link must never swap your Telegram silently.
 */
export function TelegramCard({ username }: { username: string }) {
  const api = useApi();
  const status = useAsync(() => api.telegramStatus(), [api]);
  const [pending, setPending] = useState(pendingLinkToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      status.reload();
    } catch (failure) {
      setError(errorMessage(failure));
    }
    setBusy(false);
  }

  const confirmPending = () => act(async () => {
    const token = pending!;
    forgetLinkToken();
    setPending(null);
    await api.linkTelegram(token);
  });
  const discardPending = () => { forgetLinkToken(); setPending(null); };
  // A fresh link (valid 5 minutes) on each click; t.me opens the Telegram app.
  const openBot = () => act(async () => window.location.assign((await api.telegramBotLink()).url));

  return (
    <section className="card stack">
      <h2>Telegram</h2>
      {pending && (
        <div className="stack">
          <p>
            A link from the Telegram bot is waiting. Link that Telegram to your account <strong>{username}</strong>?
            Do it only if you sent /start to the bot yourself.
          </p>
          <div>
            <button type="button" className="primary" disabled={busy} onClick={() => void confirmPending()}>Link it</button>
            <button type="button" disabled={busy} onClick={discardPending}>Discard</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      {status.error && <p role="alert" className="error">Could not check Telegram: {status.error}</p>}
      {status.loading && !status.data && <p className="muted" role="status">Loading…</p>}
      {status.data && !pending && (status.data.linked ? (
        <>
          <p>Telegram is linked to your account.</p>
          <div><button type="button" disabled={busy} onClick={() => void act(() => api.unlinkTelegram())}>Unlink</button></div>
        </>
      ) : (
        <>
          <p className="muted">Link Telegram to answer raid invites from the bot. The link works for 5 minutes.</p>
          <div><button type="button" className="primary" disabled={busy} onClick={() => void openBot()}>Link Telegram</button></div>
        </>
      ))}
    </section>
  );
}
