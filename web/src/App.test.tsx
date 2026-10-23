import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from './api';
import { App } from './App';
import { SESSION, fakeAuth } from './test/auth';
import { Routed, currentPath, navigate } from './test/nav';
import { META, OFFICER, eventDetail, eventSummary, fakeApi } from './test/render';

const api = (over = {}) =>
  fakeApi({
    listEvents: vi.fn().mockResolvedValue([eventSummary()]),
    getEvent: vi.fn().mockResolvedValue(eventDetail()),
    ...over,
  });

describe('App', () => {
  test('opens on the events list once signed in', async () => {
    render(<App auth={fakeAuth()} api={api()}><Routed /></App>);

    expect(await screen.findByRole('link', { name: 'Raid Night' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  test('waits for game data before showing pages', async () => {
    const getMeta = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<App auth={fakeAuth()} api={api({ getMeta })}><Routed /></App>);
    await waitFor(() => expect(getMeta).toHaveBeenCalled());
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  test('if game data fails to load, offers a retry', async () => {
    const getMeta = vi.fn().mockRejectedValueOnce(new ApiError('Server error (500)', 500)).mockResolvedValue(META);
    render(<App auth={fakeAuth()} api={api({ getMeta })}><Routed /></App>);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load game data: Server error (500)');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('link', { name: 'Raid Night' })).toBeInTheDocument();
  });
});

describe('accounts', () => {
  test('signed out, the login offers to create an account, which opens the sign-up form', async () => {
    render(<App auth={fakeAuth(null)} api={api()}><Routed /></App>);
    await userEvent.click(await screen.findByRole('link', { name: 'Create an account' }));

    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(currentPath()).toBe('/signup');
  });

  test('a Raider (no officer capability) gets a welcome instead of officer pages', async () => {
    const me = vi.fn().mockResolvedValue({ userId: 'u9', username: 'newbie', role: 'Raider', capabilities: [] });
    const listEvents = vi.fn();
    render(<App auth={fakeAuth()} api={api({ me, listEvents })}><Routed /></App>);

    expect(await screen.findByRole('heading', { name: 'Welcome, newbie' })).toBeInTheDocument();
    expect(screen.getByText(/Raider/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Events' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Roster' })).not.toBeInTheDocument();
    expect(listEvents).not.toHaveBeenCalled();
  });

  test('the menu only shows what the role can open', async () => {
    const me = vi.fn().mockResolvedValue({ userId: 'u3', username: 'rl', role: 'Raidleader', capabilities: ['events.manage', 'messages.send'] });
    render(<App auth={fakeAuth()} api={api({ me })}><Routed /></App>);

    expect(await screen.findByRole('link', { name: 'Events' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Roster' })).not.toBeInTheDocument();
  });
});

describe('account pages', () => {
  test('after a reset the only page is choosing a new password; then the site opens', async () => {
    const me = vi.fn()
      .mockResolvedValueOnce({ ...OFFICER, mustChangePassword: true })
      .mockResolvedValue(OFFICER);
    const listEvents = vi.fn().mockResolvedValue([eventSummary()]);
    const injected = api({ me, listEvents });
    render(<App auth={fakeAuth()} api={injected}><Routed /></App>);

    expect(await screen.findByText(/signed in with a temporary password/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Events' })).not.toBeInTheDocument();
    expect(listEvents).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Temporary password'), 'Temp-password-123');
    await userEvent.type(screen.getByLabelText('New password'), 'Correct-horse1');
    await userEvent.type(screen.getByLabelText('Repeat new password'), 'Correct-horse1');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByRole('link', { name: 'Raid Night' })).toBeInTheDocument();
    expect(injected.changePassword).toHaveBeenCalledWith('Temp-password-123', 'Correct-horse1');
  });

  test('the forced change works even though the API refuses game data until then', async () => {
    const me = vi.fn().mockResolvedValue({ ...OFFICER, mustChangePassword: true });
    const getMeta = vi.fn().mockRejectedValue(new ApiError('Change your password first', 403));
    render(<App auth={fakeAuth()} api={api({ me, getMeta })}><Routed /></App>);

    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
    expect(screen.queryByText(/Could not load game data/)).not.toBeInTheDocument();
  });

  test('your name in the top bar opens the change-password page, for every account', async () => {
    const me = vi.fn().mockResolvedValue({ ...OFFICER, capabilities: [], role: 'Raider' });
    render(<App auth={fakeAuth()} api={api({ me })}><Routed /></App>);

    await userEvent.click(await screen.findByRole('link', { name: 'cid' }));

    expect(await screen.findByRole('heading', { name: 'Change password' })).toBeInTheDocument();
    expect(currentPath()).toBe('/account');
  });

  test("the bot's link (/link?t=...) is kept through sign-in and waits for a confirmation on the account page", async () => {
    window.history.replaceState({}, '', '/link?t=BOTTOKEN');
    navigate('/link');
    const injected = api();
    render(<App auth={fakeAuth(null)} api={injected}><Routed /></App>);

    await userEvent.type(await screen.findByLabelText('Nickname'), 'cid');
    await userEvent.type(screen.getByLabelText('Password'), 'pw{enter}');
    navigate('/account'); // what app/link/page.tsx does once signed in

    expect(await screen.findByText(/link from the Telegram bot is waiting/i)).toBeInTheDocument();
    expect(injected.linkTelegram).not.toHaveBeenCalled(); // never automatic: a crafted link must not swap your Telegram
    await userEvent.click(screen.getByRole('button', { name: 'Link it' }));
    expect(injected.linkTelegram).toHaveBeenCalledWith('BOTTOKEN');
    window.history.replaceState({}, '', '/');
  });

  test('accounts.manage shows the Users page in the menu', async () => {
    const injected = api();
    render(<App auth={fakeAuth()} api={injected}><Routed /></App>);

    await userEvent.click(await screen.findByRole('link', { name: 'Users' }));

    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument();
    expect(injected.listUsers).toHaveBeenCalled();
  });

  test('without accounts.manage there is no Users entry', async () => {
    const me = vi.fn().mockResolvedValue({ ...OFFICER, capabilities: ['events.manage'] });
    render(<App auth={fakeAuth()} api={api({ me })}><Routed /></App>);
    await screen.findByRole('link', { name: 'Events' });
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });
});

describe('navigation', () => {
  test('the menu switches between events and the roster, marking the current page', async () => {
    render(<App auth={fakeAuth()} api={api({ listRoster: vi.fn().mockResolvedValue([]) })}><Routed /></App>);
    await screen.findByRole('link', { name: 'Raid Night' });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(screen.getByRole('link', { name: 'Events' })).toHaveAttribute('aria-current', 'page');

    await userEvent.click(screen.getByRole('link', { name: 'Roster' }));

    expect(await screen.findByRole('heading', { name: 'Raid roster' })).toBeInTheDocument();
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Roster' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Events' })).not.toHaveAttribute('aria-current');
  });

  test('the URL opens an event page', async () => {
    navigate('/events/e1');
    render(<App auth={fakeAuth()} api={api()}><Routed /></App>);

    expect(await screen.findByRole('heading', { name: 'Raid Night' })).toBeInTheDocument();
    expect(screen.getByLabelText('Answer for Tom')).toBeInTheDocument();
  });

  test('following an event link and the back link navigates between pages', async () => {
    render(<App auth={fakeAuth()} api={api()}><Routed /></App>);

    await userEvent.click(await screen.findByRole('link', { name: 'Raid Night' }));
    expect(await screen.findByLabelText('Answer for Tom')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: '← Events' }));
    expect(await screen.findByRole('heading', { name: 'Events' })).toBeInTheDocument();
  });

  test('an unknown path shows the events list', async () => {
    navigate('/whatever');
    render(<App auth={fakeAuth()} api={api()}><Routed /></App>);
    expect(await screen.findByRole('heading', { name: 'Events' })).toBeInTheDocument();
  });
});

describe('appearance', () => {
  afterEachReset();

  test('starts with the default theme and applies the one the officer picks, remembering it', async () => {
    render(<App auth={fakeAuth()} api={api()}><Routed /></App>);
    await screen.findByRole('link', { name: 'Raid Night' });
    expect(document.documentElement.dataset.theme).toBe('midnight');

    await userEvent.click(screen.getByText('Appearance'));
    await userEvent.click(screen.getByRole('radio', { name: /Parchment/ }));

    expect(document.documentElement.dataset.theme).toBe('parchment');
    expect(JSON.parse(localStorage.getItem('guild-admin-prefs')!)).toMatchObject({ theme: 'parchment' });
  });

  test('the icon style changes the board immediately', async () => {
    navigate('/events/e1');
    render(<App auth={fakeAuth()} api={api()}><Routed /></App>);
    const tomRow = (await screen.findByText('Tom')).closest('li')!;
    expect(tomRow.querySelector('img.spec-icon')).not.toBeNull();

    await userEvent.click(screen.getByText('Appearance'));
    await userEvent.click(screen.getByRole('radio', { name: /No icons/ }));

    await waitFor(() => expect(tomRow.querySelector('img.spec-icon')).toBeNull());
    expect(document.documentElement.dataset.icons).toBe('none');
  });

  test('a saved theme is applied on the next visit', async () => {
    localStorage.setItem('guild-admin-prefs', JSON.stringify({ theme: 'void', icons: 'line' }));
    render(<App auth={fakeAuth()} api={api()}><Routed /></App>);
    await screen.findByRole('link', { name: 'Raid Night' });
    expect(document.documentElement.dataset.theme).toBe('void');
  });
});

function afterEachReset() {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-icons');
    document.documentElement.style.colorScheme = '';
  });
}

describe('signing in', () => {
  const server = (status: number, body: unknown = {}) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

  test('shows a loading state while the session is restored, then the login when signed out', async () => {
    const auth = fakeAuth(null);
    const injected = api();
    render(<App auth={auth} api={injected}><Routed /></App>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');

    expect(await screen.findByLabelText('Nickname')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(injected.getMeta).not.toHaveBeenCalled();
    expect(injected.me).not.toHaveBeenCalled();
  });

  test('signing in returns to the page the officer was on', async () => {
    navigate('/events/e1');
    const auth = fakeAuth(null);
    render(<App auth={auth} api={api()}><Routed /></App>);

    await userEvent.type(await screen.findByLabelText('Nickname'), 'Cid');
    await userEvent.type(screen.getByLabelText('Password'), 'pw{enter}');

    expect(await screen.findByLabelText('Answer for Tom')).toBeInTheDocument();
    expect(currentPath()).toBe('/events/e1');
  });

  test('the top bar shows the officer nickname and signs out', async () => {
    const auth = fakeAuth();
    render(<App auth={auth} api={api()}><Routed /></App>);
    expect(await screen.findByText('cid')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/wgt|@/);

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(auth.mocks.signOut).toHaveBeenCalledWith();
    expect(await screen.findByLabelText('Nickname')).toBeInTheDocument();
  });

  test('sign out falls back to a local sign-out when the global one fails (offline)', async () => {
    const auth = fakeAuth();
    auth.mocks.signOut.mockResolvedValueOnce({ error: new Error('offline') } as never);
    render(<App auth={auth} api={api()}><Routed /></App>);
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(auth.mocks.signOut).toHaveBeenNthCalledWith(2, { scope: 'local' });
    expect(await screen.findByLabelText('Nickname')).toBeInTheDocument();
  });

  test('sign out also falls back when the global call throws', async () => {
    const auth = fakeAuth();
    auth.mocks.signOut.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<App auth={auth} api={api()}><Routed /></App>);
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(auth.mocks.signOut).toHaveBeenNthCalledWith(2, { scope: 'local' });
  });

  test('signing out in another tab shows the login here', async () => {
    const auth = fakeAuth();
    render(<App auth={auth} api={api()}><Routed /></App>);
    await screen.findByRole('link', { name: 'Raid Night' });

    act(() => auth.emit('SIGNED_OUT', null));

    expect(await screen.findByLabelText('Nickname')).toBeInTheDocument();
  });

  test('an account that is not an officer is told so and can sign out', async () => {
    const auth = fakeAuth();
    render(<App auth={auth} fetchImpl={server(403, { error: 'Forbidden' }) as never}><Routed /></App>);

    expect(await screen.findByRole('alert')).toHaveTextContent('This account has no access to the site.');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByLabelText('Nickname')).toBeInTheDocument();
  });

  test('a rejected token (401) signs out and shows the login', async () => {
    const auth = fakeAuth();
    const fetchImpl = server(401);
    render(<App auth={auth} fetchImpl={fetchImpl as never}><Routed /></App>);

    expect(await screen.findByLabelText('Nickname')).toBeInTheDocument();
    expect(auth.mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  test('every request carries the current token', async () => {
    const auth = fakeAuth();
    const fetchImpl = server(200, OFFICER);
    render(<App auth={auth} fetchImpl={fetchImpl as never}><Routed /></App>);
    await screen.findByText('cid');

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/auth/me');
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${SESSION.access_token}`);
  });

  test('if the account check fails for another reason, it can be retried', async () => {
    const me = vi.fn().mockRejectedValueOnce(new ApiError('Cannot reach the server. Is the API running?', 0)).mockResolvedValue(OFFICER);
    render(<App auth={fakeAuth()} api={api({ me })}><Routed /></App>);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not check your account: Cannot reach the server');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('link', { name: 'Raid Night' })).toBeInTheDocument();
  });

  test('missing Supabase settings show a clear message instead of a blank page', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    render(<App api={api()}><Routed /></App>);
    vi.unstubAllEnvs();

    expect(screen.getByRole('alert')).toHaveTextContent(/NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });
});
