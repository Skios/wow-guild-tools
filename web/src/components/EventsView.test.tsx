import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from '../api';
import { character, eventSummary, fakeApi, renderWith } from '../test/render';
import { EventsView } from './EventsView';

afterEach(() => vi.restoreAllMocks());

const withData = (events = [eventSummary()], characters = [character('Jaina')]) =>
  fakeApi({ listEvents: vi.fn().mockResolvedValue(events), listCharacters: vi.fn().mockResolvedValue(characters) });

describe('events list', () => {
  test('shows a loading state, then the events with links, status and counts', async () => {
    renderWith(<EventsView />, withData());

    expect(screen.getByRole('status')).toHaveTextContent('Loading events');
    const link = await screen.findByRole('link', { name: 'Raid Night' });
    expect(link).toHaveAttribute('href', '#/events/e1');
    const row = link.closest('tr')!;
    expect(within(row).getByText('Open')).toBeInTheDocument();
    expect(within(row).getByText('5 in')).toBeInTheDocument();
    expect(within(row).getByText('3 confirmed')).toBeInTheDocument();
    expect(within(row).getByText(/1 tentative · 1 bench · 2 out/)).toBeInTheDocument();
  });

  test('marks published events', async () => {
    renderWith(<EventsView />, withData([eventSummary({ isPublished: true })]));
    expect(await screen.findByText('Published')).toBeInTheDocument();
  });

  test('upcoming events are listed before past ones', async () => {
    const past = eventSummary({ id: 'p', title: 'Old raid', startTime: '2020-01-01T19:00:00Z', endTime: '2020-01-01T22:00:00Z' });
    renderWith(<EventsView />, withData([past, eventSummary()]));

    const links = await screen.findAllByRole('link');
    expect(links.map(l => l.textContent)).toEqual(['Raid Night', 'Old raid']);
  });

  test('invites the officer to create the first event when there are none', async () => {
    renderWith(<EventsView />, withData([]));
    expect(await screen.findByText(/No events yet/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('a failure is shown with a Retry that reloads', async () => {
    const listEvents = vi.fn().mockRejectedValueOnce(new ApiError('Cannot reach the server', 0)).mockResolvedValue([eventSummary()]);
    renderWith(<EventsView />, fakeApi({ listEvents, listCharacters: vi.fn().mockResolvedValue([character('Jaina')]) }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('link', { name: 'Raid Night' })).toBeInTheDocument();
    expect(screen.queryByText('Cannot reach the server')).not.toBeInTheDocument();
  });

  test('Refresh reloads the list', async () => {
    const api = withData();
    renderWith(<EventsView />, api);
    await screen.findByRole('link', { name: 'Raid Night' });

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(api.listEvents).toHaveBeenCalledTimes(2));
  });
});

describe('new event form', () => {
  const fillTitle = (text: string) => userEvent.type(screen.getByLabelText('Title'), text);
  const submit = () => userEvent.click(screen.getByRole('button', { name: 'Create event' }));

  test('explains that players must register first when nobody exists', async () => {
    renderWith(<EventsView />, withData([], []));
    expect(await screen.findByText(/Nobody has registered yet/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
  });

  test('lists each player once as a possible creator, alphabetically', async () => {
    const chars = [character('Zed'), character('Amy'), character('Amy2', { userId: 'u-Amy', username: 'amy_player' })];
    renderWith(<EventsView />, withData([], chars));

    const select = await screen.findByLabelText('Created by');
    expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(['amy_player', 'zed_player']);
  });

  test('creates the event with trimmed text and ISO dates, then refreshes the list', async () => {
    const api = withData();
    renderWith(<EventsView />, api);
    await screen.findByLabelText('Title');

    await fillTitle('  Heroic night  ');
    await submit();

    await waitFor(() => expect(api.createEvent).toHaveBeenCalledOnce());
    const payload = (api.createEvent as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(payload).toMatchObject({ title: 'Heroic night', createdByUserId: 'u-Jaina' });
    expect(payload.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/);
    expect(payload).not.toHaveProperty('description');
    await waitFor(() => expect(api.listEvents).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Title')).toHaveValue('');
  });

  test('blocks an empty title and marks the field invalid, without calling the API', async () => {
    const api = withData();
    renderWith(<EventsView />, api);
    await screen.findByLabelText('Title');

    await submit();

    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
    expect(api.createEvent).not.toHaveBeenCalled();
  });

  test('blocks an end that is not after the start', async () => {
    const api = withData();
    renderWith(<EventsView />, api);
    await screen.findByLabelText('Title');

    await fillTitle('Raid');
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2099-10-18T20:00' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '2099-10-18T19:00' } });
    await submit();

    expect(screen.getByText('End must be after start')).toBeInTheDocument();
    expect(api.createEvent).not.toHaveBeenCalled();
  });

  test('blocks a 30 February and a cleared date', async () => {
    renderWith(<EventsView />, withData());
    await screen.findByLabelText('Title');

    await fillTitle('Raid');
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '' } });
    await submit();

    expect(screen.getByText('Enter a valid end')).toBeInTheDocument();
  });

  test('shows the server message and keeps what the officer typed', async () => {
    const createEvent = vi.fn().mockRejectedValue(new ApiError('title: Title is required', 400));
    const api = fakeApi({ listEvents: vi.fn().mockResolvedValue([]), listCharacters: vi.fn().mockResolvedValue([character('Jaina')]), createEvent });
    renderWith(<EventsView />, api);
    await screen.findByLabelText('Title');

    await fillTitle('Raid');
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('title: Title is required');
    expect(screen.getByLabelText('Title')).toHaveValue('Raid');
    expect(screen.getByRole('button', { name: 'Create event' })).toBeEnabled();
  });

  test('double clicking creates one event', async () => {
    let resolve!: (v: unknown) => void;
    const createEvent = vi.fn().mockReturnValue(new Promise(r => { resolve = r; }));
    const api = fakeApi({ listEvents: vi.fn().mockResolvedValue([]), listCharacters: vi.fn().mockResolvedValue([character('Jaina')]), createEvent });
    renderWith(<EventsView />, api);
    await screen.findByLabelText('Title');

    await fillTitle('Raid');
    await userEvent.dblClick(screen.getByRole('button', { name: 'Create event' }));

    expect(createEvent).toHaveBeenCalledTimes(1);
    resolve({});
  });

  test('remembers who the creator was for next time', async () => {
    const chars = [character('Amy'), character('Zed')];
    const first = renderWith(<EventsView />, withData([], chars));
    await userEvent.selectOptions(await screen.findByLabelText('Created by'), 'u-Zed');
    await fillTitle('Raid');
    await submit();
    await waitFor(() => expect(localStorage.getItem('guild-admin-creator')).toBe('u-Zed'));
    first.unmount();

    renderWith(<EventsView />, withData([], chars));
    expect(await screen.findByLabelText('Created by')).toHaveValue('u-Zed');
  });

  test('works when browser storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const api = withData();
    renderWith(<EventsView />, api);
    await screen.findByLabelText('Title');

    await fillTitle('Raid');
    await submit();

    await waitFor(() => expect(api.createEvent).toHaveBeenCalled());
  });

  test('a stale remembered creator who no longer exists falls back to the first player', async () => {
    localStorage.setItem('guild-admin-creator', 'ghost');
    renderWith(<EventsView />, withData([], [character('Amy')]));
    expect(await screen.findByLabelText('Created by')).toHaveValue('u-Amy');
  });

  test('if players cannot be loaded, says so instead of showing a broken form', async () => {
    const api = fakeApi({ listEvents: vi.fn().mockResolvedValue([]), listCharacters: vi.fn().mockRejectedValue(new Error('db down')) });
    renderWith(<EventsView />, api);

    expect(await screen.findByText(/Could not load players: db down/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
  });
});
