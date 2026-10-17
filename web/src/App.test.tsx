import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from './api';
import { App } from './App';
import { META, eventDetail, eventSummary, fakeApi } from './test/render';

const api = (over = {}) =>
  fakeApi({
    listEvents: vi.fn().mockResolvedValue([eventSummary()]),
    getEvent: vi.fn().mockResolvedValue(eventDetail()),
    ...over,
  });

describe('App', () => {
  test('opens straight on the events list: there is no login for now', async () => {
    render(<App api={api()} />);

    expect(await screen.findByRole('link', { name: 'Raid Night' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/API key/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign/i })).not.toBeInTheDocument();
  });

  test('waits for game data before showing pages', () => {
    render(<App api={api({ getMeta: vi.fn().mockReturnValue(new Promise(() => {})) })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  test('if game data fails to load, offers a retry', async () => {
    const getMeta = vi.fn().mockRejectedValueOnce(new ApiError('Server error (500)', 500)).mockResolvedValue(META);
    render(<App api={api({ getMeta })} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load game data: Server error (500)');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('link', { name: 'Raid Night' })).toBeInTheDocument();
  });
});

describe('navigation', () => {
  test('the menu switches between events and the roster, marking the current page', async () => {
    render(<App api={api({ listRoster: vi.fn().mockResolvedValue([]) })} />);
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
    render(<App api={api()} />);

    expect(await screen.findByRole('heading', { name: 'Raid Night' })).toBeInTheDocument();
    expect(screen.getByLabelText('Answer for Tom')).toBeInTheDocument();
  });

  test('following an event link and the back link navigates between pages', async () => {
    render(<App api={api()} />);

    await userEvent.click(await screen.findByRole('link', { name: 'Raid Night' }));
    expect(await screen.findByLabelText('Answer for Tom')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: '← Events' }));
    expect(await screen.findByRole('heading', { name: 'Events' })).toBeInTheDocument();
  });

  test('an unknown hash shows the events list', async () => {
    window.location.hash = '#/whatever';
    render(<App api={api()} />);
    expect(await screen.findByRole('heading', { name: 'Events' })).toBeInTheDocument();
  });
});

describe('appearance', () => {
  afterEachReset();

  test('starts with the default theme and applies the one the officer picks, remembering it', async () => {
    render(<App api={api()} />);
    await screen.findByRole('link', { name: 'Raid Night' });
    expect(document.documentElement.dataset.theme).toBe('midnight');

    await userEvent.click(screen.getByText('Appearance'));
    await userEvent.click(screen.getByRole('radio', { name: /Parchment/ }));

    expect(document.documentElement.dataset.theme).toBe('parchment');
    expect(JSON.parse(localStorage.getItem('guild-admin-prefs')!)).toMatchObject({ theme: 'parchment' });
  });

  test('the icon style changes the board immediately', async () => {
    window.location.hash = '#/events/e1';
    render(<App api={api()} />);
    const tomRow = (await screen.findByText('Tom')).closest('li')!;
    expect(tomRow.querySelector('img.spec-icon')).not.toBeNull();

    await userEvent.click(screen.getByText('Appearance'));
    await userEvent.click(screen.getByRole('radio', { name: /No icons/ }));

    await waitFor(() => expect(tomRow.querySelector('img.spec-icon')).toBeNull());
    expect(document.documentElement.dataset.icons).toBe('none');
  });

  test('a saved theme is applied on the next visit', async () => {
    localStorage.setItem('guild-admin-prefs', JSON.stringify({ theme: 'void', icons: 'line' }));
    render(<App api={api()} />);
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
