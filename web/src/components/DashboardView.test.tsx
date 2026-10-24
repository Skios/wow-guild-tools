import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import type { Dashboard, MyEvent } from '../types';
import { OFFICER, fakeApi, renderWith } from '../test/render';
import { DashboardView } from './DashboardView';

const RAIDER: typeof OFFICER = { ...OFFICER, role: 'Raider', capabilities: [] };
const MAIN = { id: 'c-main', name: 'Ulfgaar', class: 'WARRIOR', spec: 'PROTECTION', role: 'TANK' as const };
const ALT = { id: 'c-alt', name: 'Kerlink', class: 'MAGE', spec: 'FIRE', role: 'RANGED_DPS' as const };
const event = (over: Partial<MyEvent> = {}): MyEvent => ({ id: 'e1', title: 'Raid Night', startTime: '2099-10-18T19:00:00Z', endTime: '2099-10-18T22:00:00Z', isPublished: false, state: 'OPEN', answer: null, ...over });
const board = (over: Partial<Dashboard> = {}): Dashboard => ({ me: { characters: [MAIN, ALT], events: [event()] }, ...over });

const setup = (data: Dashboard = board(), officer = RAIDER, over = {}) => {
  const api = fakeApi({ dashboard: vi.fn().mockResolvedValue(data), ...over });
  renderWith(<DashboardView />, api, undefined, officer);
  return api;
};
const card = () => screen.findByRole('row', { name: 'Raid Night' });

describe('my next events', () => {
  test('answers with one tap, as the main by default, then refreshes', async () => {
    const api = setup();
    const raid = await card();

    await userEvent.click(within(raid).getByRole('button', { name: 'In' }));

    await waitFor(() => expect(api.answerEvent).toHaveBeenCalledWith('e1', { characterId: 'c-main', status: 'IN' }));
    await waitFor(() => expect(api.dashboard).toHaveBeenCalledTimes(2));
  });

  test('shows the current answer, its character and note; another character can answer instead', async () => {
    const api = setup(board({ me: { characters: [MAIN, ALT], events: [event({ answer: { eventId: 'e1', characterId: 'c-alt', status: 'TENTATIVE', isConfirmed: false, arrivalTime: null, note: 'maybe' } })] } }));
    const raid = await card();

    expect(within(raid).getByRole('button', { name: 'Tentative' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(raid).getByLabelText('Answer with')).toHaveValue('c-alt');
    expect(within(raid).getByText('maybe')).toBeInTheDocument();

    await userEvent.selectOptions(within(raid).getByLabelText('Answer with'), 'c-main');
    await waitFor(() => expect(api.answerEvent).toHaveBeenCalledWith('e1', { characterId: 'c-main', status: 'TENTATIVE' }));
  });

  test('one row per event: your answer with the character, and the character menu in its class colour', async () => {
    setup(board({ me: { characters: [MAIN, ALT], events: [event({ answer: { eventId: 'e1', characterId: 'c-main', status: 'IN', isConfirmed: false, arrivalTime: null, note: null } })] } }));
    const raid = await card();
    const [yours] = within(raid).getAllByRole('cell');

    expect(yours).toHaveTextContent('InUlfgaar');
    expect(within(raid).getByLabelText('Answer with')).toHaveStyle({ color: 'rgb(199, 156, 110)' }); // warrior
    // Each character in its own class colour.
    expect(within(raid).getByRole('option', { name: 'Ulfgaar' })).toHaveStyle({ color: 'rgb(199, 156, 110)' });
    expect(within(raid).getByRole('option', { name: 'Kerlink' })).toHaveStyle({ color: 'rgb(64, 199, 235)' }); // mage
  });

  test('LATE asks for the minutes and a note in a dialog', async () => {
    const api = setup();
    const raid = await card();

    await userEvent.click(within(raid).getByRole('button', { name: 'Late' }));
    const dialog = screen.getByRole('dialog', { name: 'Late for Raid Night' });
    await userEvent.type(within(dialog).getByLabelText('Minutes late'), '15');
    await userEvent.type(within(dialog).getByLabelText('Note'), 'traffic');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.answerEvent).toHaveBeenCalledWith('e1', { characterId: 'c-main', status: 'LATE', lateMinutes: 15, note: 'traffic' }));
  });

  test('a note on an existing answer; before answering there is nothing to note', async () => {
    const api = setup(board({ me: { characters: [MAIN], events: [
      event({ answer: { eventId: 'e1', characterId: 'c-main', status: 'IN', isConfirmed: false, arrivalTime: null, note: null } }),
      event({ id: 'e2', title: 'Alt run' }),
    ] } }));
    const raid = await card();
    expect(within(screen.getByRole('row', { name: 'Alt run' })).getByRole('button', { name: 'Note…' })).toBeDisabled();
    expect(within(raid).queryByLabelText('Answer with')).not.toBeInTheDocument(); // only one character

    await userEvent.click(within(raid).getByRole('button', { name: 'Note…' }));
    const dialog = screen.getByRole('dialog', { name: 'Note for Raid Night' });
    expect(within(dialog).queryByLabelText('Minutes late')).not.toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Note'), 'leaving 23:30');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.answerEvent).toHaveBeenCalledWith('e1', { characterId: 'c-main', status: 'IN', note: 'leaving 23:30' }));
  });

  test('a published event is read-only and says where you are', async () => {
    setup(board({ me: { characters: [MAIN], events: [event({ isPublished: true, state: 'CLOSED', answer: { eventId: 'e1', characterId: 'c-main', status: 'IN', isConfirmed: true, arrivalTime: null, note: null } })] } }));
    const raid = await card();

    expect(within(raid).getByText(/You're in the team with Ulfgaar/)).toBeInTheDocument();
    expect(within(raid).queryByRole('button', { name: 'In' })).not.toBeInTheDocument();
  });

  test('started or cancelled: no buttons, says why', async () => {
    setup(board({ me: { characters: [MAIN], events: [
      event({ state: 'STARTED', answer: { eventId: 'e1', characterId: 'c-main', status: 'IN', isConfirmed: false, arrivalTime: null, note: null } }),
      event({ id: 'e2', title: 'Alt run', state: 'CANCELED' }),
    ] } }));
    const raid = await card();

    expect(within(raid).getByText('Sign-ups are closed: you said in.')).toBeInTheDocument();
    expect(within(raid).getByText('Started')).toBeInTheDocument();
    expect(within(raid).queryByRole('button', { name: 'In' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: 'Alt run' })).getByText('This event is cancelled.')).toBeInTheDocument();
  });

  test('no approved character yet: says how to get one', async () => {
    setup(board({ me: { characters: [], events: [event()] } }));
    expect(await screen.findByText(/Add your characters on your profile/)).toBeInTheDocument();
    expect(within(await card()).queryByRole('button', { name: 'In' })).not.toBeInTheDocument();
  });

  test('a refused answer shows why', async () => {
    const { ApiError } = await import('../api');
    setup(board(), RAIDER, { answerEvent: vi.fn().mockRejectedValue(new ApiError('Sign-ups are closed', 409)) });
    await userEvent.click(within(await card()).getByRole('button', { name: 'Out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-ups are closed');
  });

  test('a refused note keeps the dialog open with the reason; Escape closes it and focus goes back', async () => {
    const { ApiError } = await import('../api');
    setup(board({ me: { characters: [MAIN], events: [event({ answer: { eventId: 'e1', characterId: 'c-main', status: 'IN', isConfirmed: false, arrivalTime: null, note: null } })] } }),
      RAIDER, { answerEvent: vi.fn().mockRejectedValue(new ApiError('Sign-ups are closed', 409)) });
    const raid = await card();

    await userEvent.click(within(raid).getByRole('button', { name: 'Note…' }));
    const dialog = screen.getByRole('dialog', { name: 'Note for Raid Night' });
    await userEvent.type(within(dialog).getByLabelText('Note'), 'late-ish');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Sign-ups are closed');
    expect(within(dialog).getByLabelText('Note')).toHaveValue('late-ish');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(raid).getByRole('button', { name: 'Note…' })).toHaveFocus();
  });

  test('picking a character before answering only chooses it; the next tap answers with it', async () => {
    const api = setup();
    const raid = await card();

    await userEvent.selectOptions(within(raid).getByLabelText('Answer with'), 'c-alt');
    expect(api.answerEvent).not.toHaveBeenCalled();
    await userEvent.click(within(raid).getByRole('button', { name: 'Out' }));
    await waitFor(() => expect(api.answerEvent).toHaveBeenCalledWith('e1', { characterId: 'c-alt', status: 'OUT' }));
  });

  test('the Late dialog can empty an existing note', async () => {
    const api = setup(board({ me: { characters: [MAIN], events: [event({ answer: { eventId: 'e1', characterId: 'c-main', status: 'LATE', isConfirmed: false, arrivalTime: '2099-10-18T19:20:00Z', note: 'traffic' } })] } }));
    const raid = await card();

    await userEvent.click(within(raid).getByRole('button', { name: 'Late' }));
    const dialog = screen.getByRole('dialog', { name: 'Late for Raid Night' });
    expect(within(dialog).getByLabelText('Minutes late')).toHaveValue(20);
    await userEvent.clear(within(dialog).getByLabelText('Note'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.answerEvent).toHaveBeenCalledWith('e1', { characterId: 'c-main', status: 'LATE', lateMinutes: 20, note: '' }));
  });

  test('a raider sees no officer sections', async () => {
    setup();
    await card();
    expect(screen.queryByRole('region', { name: 'Events at a glance' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Attendance' })).not.toBeInTheDocument();
  });
});

describe('officer sections', () => {
  const officerBoard = board({
    composition: [{
      id: 'e1', title: 'Raid Night', startTime: '2099-10-18T19:00:00Z', state: 'OPEN', confirmed: 10, noAnswer: 4, nextReminder: '2099-10-17T19:00:00Z',
      byRole: { TANK: 1, HEALER: 2, DPS: 3, RANGED_DPS: 4 }, roleTarget: { mode: 'flex', tanks: 2, healersPer5: 1, meleeShare: 50 },
    }],
    todo: { pendingApprovals: 3, toPublish: [{ id: 'e1', title: 'Raid Night', startTime: '2099-10-18T19:00:00Z' }], noTelegram: [{ id: 'u9', name: 'Shh' }] },
    attendance: { span: 10, events: 8, players: [{ id: 'u1', name: 'Matte', in: 5, late: 1, bench: 1, out: 1, tentative: 0, noAnswer: 0 }] },
  });

  test('composition per open event against its target', async () => {
    setup(officerBoard, OFFICER);
    const glance = await screen.findByRole('region', { name: 'Events at a glance' });
    const row = within(glance).getByRole('row', { name: /Raid Night/ });

    expect(within(row).getByRole('link', { name: 'Raid Night' })).toHaveAttribute('href', '/events/e1');
    expect(row).toHaveTextContent('1 (2) short'); // tanks short (said, not only red)
    expect(row).toHaveTextContent('2 (2)'); // healers: 1 per 5 of 10
    expect(row).toHaveTextContent('4'); // no answer
  });

  test('to do: approvals, events to publish, players without Telegram', async () => {
    setup(officerBoard, OFFICER);
    const todo = await screen.findByRole('region', { name: 'To do' });

    expect(within(todo).getByRole('link', { name: /3 characters waiting for approval/ })).toHaveAttribute('href', '/roster');
    expect(within(todo).getByRole('link', { name: /Publish Raid Night/ })).toHaveAttribute('href', '/events/e1');
    expect(within(todo).getByText(/Shh/)).toBeInTheDocument();
  });

  test('attendance over a span the officer picks: N events or the whole season', async () => {
    const api = setup(officerBoard, OFFICER);
    const table = await screen.findByRole('region', { name: 'Attendance' });
    const matte = within(table).getByRole('row', { name: /Matte/ });

    expect(within(matte).getByRole('rowheader')).toHaveTextContent('Matte');
    expect(within(matte).getAllByRole('cell').map(c => c.textContent)).toEqual(['5', '1', '1', '1', '0', '0']);
    expect(within(table).getByText(/over 8 published events/i)).toBeInTheDocument();

    await userEvent.selectOptions(within(table).getByLabelText('Attendance span'), 'season');
    await waitFor(() => expect(api.dashboard).toHaveBeenLastCalledWith('season'));
    fireEvent.change(within(table).getByLabelText('Attendance span'), { target: { value: '20' } });
    await waitFor(() => expect(api.dashboard).toHaveBeenLastCalledWith(20));
  });
});
