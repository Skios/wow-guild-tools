import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from './api';
import { App } from './App';
import { saveKey } from './session';
import { META, character, eventDetail, eventSummary, fakeApi } from './test/render';

afterEach(() => vi.unstubAllGlobals());

const api = (over = {}) =>
  fakeApi({
    listEvents: vi.fn().mockResolvedValue([eventSummary()]),
    listCharacters: vi.fn().mockResolvedValue([character('Jaina')]),
    getEvent: vi.fn().mockResolvedValue(eventDetail()),
    ...over,
  });

describe('signing in', () => {
  test('starts at the login page when there is no stored key', () => {
    render(<App api={api()} />);
    expect(screen.getByRole('heading', { name: 'Guild Raid Admin' })).toBeInTheDocument();
    expect(screen.getByLabelText('API key')).toBeInTheDocument();
  });

  test('a valid key opens the events page', async () => {
    render(<App api={api()} />);

    await userEvent.type(screen.getByLabelText('API key'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('link', { name: 'Raid Night' })).toBeInTheDocument();
    expect(sessionStorage.getItem('guild-admin-api-key')).toBe('secret');
  });

  test('a stored key skips the login page after a reload', async () => {
    saveKey('stored');
    render(<App api={api()} />);

    expect(await screen.findByRole('link', { name: 'Raid Night' })).toBeInTheDocument();
    expect(screen.queryByLabelText('API key')).not.toBeInTheDocument();
  });

  test('sign out forgets the key and returns to login', async () => {
    saveKey('stored');
    render(<App api={api()} />);
    await screen.findByRole('link', { name: 'Raid Night' });

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(screen.getByLabelText('API key')).toBeInTheDocument();
    expect(sessionStorage.getItem('guild-admin-api-key')).toBeNull();
  });
});

describe('session expiry', () => {
  test('a 401 from the server signs the officer out and explains why', async () => {
    saveKey('revoked');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"Unauthorized"}', { status: 401 })));

    render(<App />);

    expect(await screen.findByText(/Your session ended/)).toBeInTheDocument();
    expect(screen.getByLabelText('API key')).toBeInTheDocument();
    expect(sessionStorage.getItem('guild-admin-api-key')).toBeNull();
  });

  test('signing in again clears the expiry notice', async () => {
    saveKey('revoked');
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/auth/check')) return new Response('{"ok":true}', { status: 200 });
      return new Response('{"error":"Unauthorized"}', { status: 401 });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await screen.findByText(/Your session ended/);

    await userEvent.type(screen.getByLabelText('API key'), 'fresh');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(screen.queryByText(/Your session ended/)).not.toBeInTheDocument());
  });

  test('sends the stored key with every request', async () => {
    saveKey('stored');
    const fetchMock = vi.fn(async () => new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get('x-api-key')).toBe('stored');
  });
});

describe('game data and routing', () => {
  test('waits for game data before showing pages', () => {
    saveKey('k');
    render(<App api={api({ getMeta: vi.fn().mockReturnValue(new Promise(() => {})) })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  test('if game data fails to load, offers a retry', async () => {
    saveKey('k');
    const getMeta = vi.fn().mockRejectedValueOnce(new ApiError('Server error (500)', 500)).mockResolvedValue(META);
    render(<App api={api({ getMeta })} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load game data: Server error (500)');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('link', { name: 'Raid Night' })).toBeInTheDocument();
  });

  test('the URL hash opens an event page', async () => {
    saveKey('k');
    window.location.hash = '#/events/e1';
    render(<App api={api()} />);

    expect(await screen.findByRole('heading', { name: 'Raid Night' })).toBeInTheDocument();
    expect(screen.getByLabelText('Answer for Tom')).toBeInTheDocument();
  });

  test('following an event link and the back link navigates between pages', async () => {
    saveKey('k');
    render(<App api={api()} />);

    await userEvent.click(await screen.findByRole('link', { name: 'Raid Night' }));
    expect(await screen.findByLabelText('Answer for Tom')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: '← Events' }));
    expect(await screen.findByRole('heading', { name: 'Events' })).toBeInTheDocument();
  });

  test('an unknown hash shows the events list', async () => {
    saveKey('k');
    window.location.hash = '#/whatever';
    render(<App api={api()} />);
    expect(await screen.findByRole('heading', { name: 'Events' })).toBeInTheDocument();
  });
});
