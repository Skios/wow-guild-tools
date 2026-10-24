import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from '../api';
import { eventSummary, fakeApi, renderWith } from '../test/render';
import { EventsView } from './EventsView';

afterEach(() => vi.restoreAllMocks());

const withData = (events = [eventSummary()], _characters: unknown[] = []) =>
  fakeApi({ listEvents: vi.fn().mockResolvedValue(events) });

describe('events list', () => {
  test('shows a loading state, then the events with links, status and counts', async () => {
    renderWith(<EventsView />, withData());

    expect(screen.getByRole('status')).toHaveTextContent('Loading events');
    const link = await screen.findByRole('link', { name: 'Raid Night' });
    expect(link).toHaveAttribute('href', '/events/e1');
    const row = link.closest('tr')!;
    expect(within(row).getByText('Open')).toBeInTheDocument();
    expect(within(row).getByText('5 in')).toBeInTheDocument();
    expect(within(row).getByText('3 confirmed')).toBeInTheDocument();
    expect(within(row).getByText(/1 tentative · 1 bench · 2 out · 4 no answer/)).toBeInTheDocument();
  });

  test('late players are counted next to the ones who are in', async () => {
    renderWith(<EventsView />, withData([eventSummary({ counts: { in: 5, out: 0, tentative: 0, bench: 0, late: 2, confirmed: 3, noAnswer: 0 } })]));
    expect(await screen.findByText('5 in · 2 late')).toBeInTheDocument();
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
    renderWith(<EventsView />, fakeApi({ listEvents }));

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

  test('is always available: officers do not need to pick a creator, and the whole roster is invited', async () => {
    renderWith(<EventsView />, withData([], []));
    expect(await screen.findByLabelText('Title')).toBeInTheDocument();
    expect(screen.queryByLabelText('Created by')).not.toBeInTheDocument();
    expect(screen.getByText(/Everyone in the raid roster is invited automatically/)).toBeInTheDocument();
  });

  test('creates the event with trimmed text and ISO dates, then refreshes the list', async () => {
    const api = withData();
    renderWith(<EventsView />, api);
    await screen.findByLabelText('Title');

    await fillTitle('  Heroic night  ');
    await submit();

    await waitFor(() => expect(api.createEvent).toHaveBeenCalledOnce());
    const payload = (api.createEvent as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(payload).toMatchObject({ title: 'Heroic night' });
    expect(payload.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/);
    expect(payload).not.toHaveProperty('description');
    expect(payload).not.toHaveProperty('createdByUserId');
    await waitFor(() => expect(api.listEvents).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Title')).toHaveValue('');
  });

  test('sends the description when there is one', async () => {
    const api = withData();
    renderWith(<EventsView />, api);
    await screen.findByLabelText('Title');

    await fillTitle('Raid');
    await userEvent.type(screen.getByLabelText(/Description/), '  Bring flasks ');
    await submit();

    await waitFor(() => expect(api.createEvent).toHaveBeenCalledWith(expect.objectContaining({ description: 'Bring flasks' })));
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

  test('blocks a cleared date', async () => {
    renderWith(<EventsView />, withData());
    await screen.findByLabelText('Title');

    await fillTitle('Raid');
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '' } });
    await submit();

    expect(screen.getByText('Enter a valid end')).toBeInTheDocument();
  });

  test('shows the server message and keeps what the officer typed', async () => {
    const createEvent = vi.fn().mockRejectedValue(new ApiError('title: Title is required', 400));
    const api = fakeApi({ listEvents: vi.fn().mockResolvedValue([]), createEvent });
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
    const api = fakeApi({ listEvents: vi.fn().mockResolvedValue([]), createEvent });
    renderWith(<EventsView />, api);
    await screen.findByLabelText('Title');

    await fillTitle('Raid');
    await userEvent.dblClick(screen.getByRole('button', { name: 'Create event' }));

    expect(createEvent).toHaveBeenCalledTimes(1);
    resolve({});
  });
});

describe('reminders on a new event', () => {
  const fillTitle = (text: string) => userEvent.type(screen.getByLabelText('Title'), text);
  const submit = () => userEvent.click(screen.getByRole('button', { name: 'Create event' }));
  test('start as a day and 8 hours before, and go with the event', async () => {
    const api = withData();
    renderWith(<EventsView />, api);
    await screen.findByLabelText('Title');

    await userEvent.click(screen.getByRole('button', { name: 'Remove 8 h before' }));
    await fillTitle('Mythic');
    await submit();

    await waitFor(() => expect(api.createEvent).toHaveBeenCalledWith(expect.objectContaining({ reminders: [1440] })));
  });
});
