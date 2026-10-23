// The bot's link (/link?t=<token>) must survive signing in or signing up, which happen on other screens.
const KEY = 'wgt-telegram-link';
const TOKEN = /^[A-Za-z0-9_-]{1,64}$/;

/** Keeps the token of the current /link?t=... URL for later. */
export function rememberLinkToken() {
  const token = new URLSearchParams(window.location.search).get('t');
  if (token && TOKEN.test(token)) try { sessionStorage.setItem(KEY, token); } catch { /* storage blocked: link again from the bot */ }
}

export function pendingLinkToken(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}

export function forgetLinkToken() {
  try { sessionStorage.removeItem(KEY); } catch { /* nothing kept */ }
}
