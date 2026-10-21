import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from './api';
import { App } from './App';
import { SESSION, fakeAuth } from './test/auth';
import { META, eventDetail, eventSummary, fakeApi } from './test/render';

const api = (over = {}) =>
  fakeApi({
    listEvents: vi.fn().mockResolvedValue([eventSummary()]),
    getEvent: vi.fn().mockResolvedValue(eventDetail()),
    ...over,
  });

describe('App', () => {
  test('opens on the events list once signed in', async () => {
    render(<App auth={fakeAuth()} api={api()} />);

    expect(await screen.findByRole('link', { name: 'Raid Night' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  test('waits for game data before showing pages', async () => {
    const getMeta = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<App auth={fakeAuth()} api={api({ getMeta })} />);
    await waitFor(() => expect(getMeta).toHaveBeenCalled());
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  test('if game data fails to load, offers a retry', async () => {
    const getMeta = vi.fn().mockRejectedValueOnce(new ApiError('Server error (500)', 500)).mockResolvedValue(META);
    render(<App auth={fakeAuth()} api={api({ getMeta })} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load game data: Server error (500)');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('link', { name: 'Raid Night' })).toBeInTheDocument();
  });
});

describe('navigation', () => {
  test('the menu switches between events and the roster, marking the current page', async () => {
    render(<App auth={fakeAuth()} api={api({ listRoster: vi.fn().mockResolvedValue([]) })} />);
    await screen.findByRole('link', { name: 'Raid Night' });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(screen.getByRole('link', { name: 'Events' })).toHaveAttribute('aria-current', 'page');

    await userEvent.click(screen.getByRole('link', { name: 'Roster' }));

    expect(await screen.findByRole('heading', { name: 'Raid roster' })).toBeInTheDocument();
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Roster' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Events' })).not.toHaveAttribute('aria-current');
  });

  test('the URL hash opens an event page', async () => {
    window.location.hash = '#/events/e1';
    render(<App auth={fakeAuth()} api={api()} />);

    expect(await screen.findByRole('heading', { name: 'Raid Night' })).toBeInTheDocument();
    expect(screen.getByLabelText('Answer for Tom')).toBeInTheDocument();
  });

  test('following an event link and the back link navigates between pages', async () => {
    render(<App auth={fakeAuth()} api={api()} />);

    await userEvent.click(await screen.findByRole('link', { name: 'Raid Night' }));
    expect(await screen.findByLabelText('Answer for Tom')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: '← Events' }));
    expect(await screen.findByRole('heading', { name: 'Events' })).toBeInTheDocument();
  });

  test('an unknown hash shows the events list', async () => {
    window.location.hash = '#/whatever';
    render(<App auth={fakeAuth()} api={api()} />);
    expect(await screen.findByRole('heading', { name: 'Events' })).toBeInTheDocument();
  });
});

describe('appearance', () => {
  afterEachReset();

  test('starts with the default theme and applies the one the officer picks, remembering it', async () => {
    render(<App auth={fakeAuth()} api={api()} />);
    await screen.findByRole('link', { name: 'Raid Night' });
    expect(document.documentElement.dataset.theme).toBe('midnight');

    await userEvent.click(screen.getByText('Appearance'));
    await userEvent.click(screen.getByRole('radio', { name: /Parchment/ }));

    expect(document.documentElement.dataset.theme).toBe('parchment');
    expect(JSON.parse(localStorage.getItem('guild-admin-prefs')!)).toMatchObject({ theme: 'parchment' });
  });

  test('the icon style changes the board immediately', async () => {
    window.location.hash = '#/events/e1';
    render(<App auth={fakeAuth()} api={api()} />);
    const tomRow = (await screen.findByText('Tom')).closest('li')!;
    expect(tomRow.querySelector('img.spec-icon')).not.toBeNull();

    await userEvent.click(screen.getByText('Appearance'));
    await userEvent.click(screen.getByRole('radio', { name: /No icons/ }));

    await waitFor(() => expect(tomRow.querySelector('img.spec-icon')).toBeNull());
    expect(document.documentElement.dataset.icons).toBe('none');
  });

  test('a saved theme is applied on the next visit', async () => {
    localStorage.setItem('guild-admin-prefs', JSON.stringify({ theme: 'void', icons: 'line' }));
    render(<App auth={fakeAuth()} api={api()} />);
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
    render(<App auth={auth} api={injected} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');

    expect(await screen.findByLabelText('Nickname')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(injected.getMeta).not.toHaveBeenCalled();
    expect(injected.me).not.toHaveBeenCalled();
  });

  test('signing in returns to the page the officer was on', async () => {
    window.location.hash = '#/events/e1';
    const auth = fakeAuth(null);
    render(<App auth={auth} api={api()} />);

    await userEvent.type(await screen.findByLabelText('Nickname'), 'Cid');
    await userEvent.type(screen.getByLabelText('Password'), 'pw{enter}');

    expect(await screen.findByLabelText('Answer for Tom')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/events/e1');
  });

  test('the top bar shows the officer nickname and signs out', async () => {
    const auth = fakeAuth();
    render(<App auth={auth} api={api()} />);
    expect(await screen.findByText('cid')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/wgt|@/);

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(auth.mocks.signOut).toHaveBeenCalledWith();
    expect(await screen.findByLabelText('Nickname')).toBeInTheDocument();
  });

  test('sign out falls back to a local sign-out when the global one fails (offline)', async () => {
    const auth = fakeAuth();
    auth.mocks.signOut.mockResolvedValueOnce({ error: new Error('offline') } as never);
    render(<App auth={auth} api={api()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(auth.mocks.signOut).toHaveBeenNthCalledWith(2, { scope: 'local' });
    expect(await screen.findByLabelText('Nickname')).toBeInTheDocument();
  });

  test('sign out also falls back when the global call throws', async () => {
    const auth = fakeAuth();
    auth.mocks.signOut.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<App auth={auth} api={api()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(auth.mocks.signOut).toHaveBeenNthCalledWith(2, { scope: 'local' });
  });

  test('signing out in another tab shows the login here', async () => {
    const auth = fakeAuth();
    render(<App auth={auth} api={api()} />);
    await screen.findByRole('link', { name: 'Raid Night' });

    act(() => auth.emit('SIGNED_OUT', null));

    expect(await screen.findByLabelText('Nickname')).toBeInTheDocument();
  });

  test('an account that is not an officer is told so and can sign out', async () => {
    const auth = fakeAuth();
    render(<App auth={auth} fetchImpl={server(403, { error: 'Forbidden' }) as never} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('This account is not an officer.');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByLabelText('Nickname')).toBeInTheDocument();
  });

  test('a rejected token (401) signs out and shows the login', async () => {
    const auth = fakeAuth();
    const fetchImpl = server(401);
    render(<App auth={auth} fetchImpl={fetchImpl as never} />);

    expect(await screen.findByLabelText('Nickname')).toBeInTheDocument();
    expect(auth.mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  test('every request carries the current token', async () => {
    const auth = fakeAuth();
    const fetchImpl = server(200, { userId: 'u1', username: 'cid' });
    render(<App auth={auth} fetchImpl={fetchImpl as never} />);
    await screen.findByText('cid');

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/auth/me');
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${SESSION.access_token}`);
  });

  test('if the account check fails for another reason, it can be retried', async () => {
    const me = vi.fn().mockRejectedValueOnce(new ApiError('Cannot reach the server. Is the API running?', 0)).mockResolvedValue({ userId: 'u1', username: 'cid' });
    render(<App auth={fakeAuth()} api={api({ me })} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not check your account: Cannot reach the server');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('link', { name: 'Raid Night' })).toBeInTheDocument();
  });

  test('missing Supabase settings show a clear message instead of a blank page', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    render(<App api={api()} />);
    vi.unstubAllEnvs();

    expect(screen.getByRole('alert')).toHaveTextContent(/VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY/);
  });
});
