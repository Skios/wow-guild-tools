import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ApiError } from '../api';
import { character, eventDetail, fakeApi, renderWith, response } from '../test/render';
import { EventView } from './EventView';

const setup = (detail = eventDetail(), characters = [character('Newbie', { class: 'ROGUE', role: 'DPS' })], over = {}) => {
  const api = fakeApi({
    getEvent: vi.fn().mockResolvedValue(detail),
    listCharacters: vi.fn().mockResolvedValue(characters),
    ...over,
  });
  renderWith(<EventView id="e1" />, api);
  return api;
};

const row = (name: string) => screen.getByText(name).closest('tr')!;
const answer = (name: string) => screen.getByLabelText(`Answer for ${name}`) as HTMLSelectElement;
const confirmBox = (name: string) => screen.getByLabelText(`Confirm ${name}`) as HTMLInputElement;
const save = () => screen.getByRole('button', { name: /Save roster|Saving/ });

describe('roster table', () => {
  test('lists the event and its players ordered tank, healer, melee, ranged', async () => {
    setup();

    expect(await screen.findByRole('heading', { name: 'Raid Night' })).toBeInTheDocument();
    expect(screen.getByText('Bring flasks')).toBeInTheDocument();
    const names = within(screen.getByRole('table')).getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell')[1]!.textContent);
    expect(names.map(n => n?.replace('Silvermoon', '').trim())).toEqual(['Tom', 'Cleo', 'Rex', 'Zed']);
  });

  test('every row shows the class colour and the role icon', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Raid Night' });

    expect(screen.getByText('Tom')).toHaveStyle({ color: 'rgb(199, 156, 110)' }); // warrior
    expect(screen.getByText('Zed')).toHaveStyle({ color: 'rgb(64, 199, 235)' }); // mage
    expect(within(row('Tom')).getByRole('img', { name: 'Tank' })).toBeInTheDocument();
    expect(within(row('Cleo')).getByRole('img', { name: 'Healer' })).toBeInTheDocument();
    expect(within(row('Rex')).getByRole('img', { name: 'Melee DPS' })).toBeInTheDocument();
    expect(within(row('Zed')).getByRole('img', { name: 'Ranged DPS' })).toBeInTheDocument();
  });

  test('shows the answer, confirmation and owner of each character', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Raid Night' });

    expect(answer('Cleo').value).toBe('TENTATIVE');
    expect(confirmBox('Tom').checked).toBe(true);
    expect(confirmBox('Cleo').checked).toBe(false);
    expect(within(row('Tom')).getByText('tom_player')).toBeInTheDocument();
  });

  test('summarises confirmed players per role and answers', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Raid Night' });

    const summary = screen.getByRole('list', { name: 'Roster summary' });
    expect(within(summary).getByText('2')).toBeInTheDocument(); // confirmed
    expect(summary).toHaveTextContent('2 in · 1 tentative · 0 bench · 1 out');
  });

  test('says so when nobody has answered yet', async () => {
    setup(eventDetail({ responses: [] }));
    expect(await screen.findByText(/Nobody has answered yet/)).toBeInTheDocument();
  });

  test('an unknown event shows the server message and a way back', async () => {
    const api = fakeApi({ getEvent: vi.fn().mockRejectedValue(new ApiError('Event not found', 404)) });
    renderWith(<EventView id="nope" />, api);

    expect(await screen.findByRole('alert')).toHaveTextContent('Event not found');
    expect(screen.getByRole('link', { name: /Back to events/ })).toHaveAttribute('href', '#/events');
  });

  test('shows a loading state first', () => {
    renderWith(<EventView id="e1" />, fakeApi({ getEvent: vi.fn().mockReturnValue(new Promise(() => {})) }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading event');
  });
});

describe('editing', () => {
  test('nothing to save until something changes', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Raid Night' });

    expect(save()).toBeDisabled();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  test('changing an answer marks the roster as changed', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Raid Night' });

    await userEvent.selectOptions(answer('Cleo'), 'BENCH');

    expect(answer('Cleo').value).toBe('BENCH');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(save()).toBeEnabled();
  });

  test('confirming someone who said OUT also moves them to IN', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Raid Night' });

    await userEvent.click(confirmBox('Rex'));

    expect(confirmBox('Rex').checked).toBe(true);
    expect(answer('Rex').value).toBe('IN');
  });

  test('moving a confirmed player out of IN removes the confirmation', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Raid Night' });

    await userEvent.selectOptions(answer('Tom'), 'OUT');

    expect(confirmBox('Tom').checked).toBe(false);
  });

  test('saves only the rows that changed, then reloads and confirms', async () => {
    const api = setup();
    await screen.findByRole('heading', { name: 'Raid Night' });

    await userEvent.selectOptions(answer('Cleo'), 'IN');
    await userEvent.click(confirmBox('Cleo'));
    await userEvent.click(save());

    await waitFor(() => expect(api.saveRoster).toHaveBeenCalledWith('e1', [{ characterId: 'c-Cleo', status: 'IN', isConfirmed: true }]));
    expect(await screen.findByText('Roster saved.')).toBeInTheDocument();
    await waitFor(() => expect(api.getEvent).toHaveBeenCalledTimes(2));
  });

  test('after reload the table shows what the server now has', async () => {
    const after = eventDetail({ responses: [response('Tom', 'TANK', 'IN', true, 'WARRIOR'), response('Cleo', 'HEALER', 'IN', true, 'PRIEST')] });
    const getEvent = vi.fn().mockResolvedValueOnce(eventDetail()).mockResolvedValue(after);
    setup(undefined, undefined, { getEvent });
    await screen.findByRole('heading', { name: 'Raid Night' });

    await userEvent.selectOptions(answer('Cleo'), 'IN');
    await userEvent.click(save());

    await waitFor(() => expect(screen.queryByText('Zed')).not.toBeInTheDocument());
    expect(answer('Cleo').value).toBe('IN');
    expect(save()).toBeDisabled();
  });

  test('a failed save shows the reason and keeps the edits', async () => {
    const saveRoster = vi.fn().mockRejectedValue(new ApiError('Event is locked: responses cannot be changed after publication', 409));
    setup(undefined, undefined, { saveRoster });
    await screen.findByRole('heading', { name: 'Raid Night' });

    await userEvent.selectOptions(answer('Cleo'), 'BENCH');
    await userEvent.click(save());

    expect(await screen.findByRole('alert')).toHaveTextContent('Event is locked');
    expect(answer('Cleo').value).toBe('BENCH');
    expect(save()).toBeEnabled();
  });

  test('controls are locked while saving, so edits cannot race the request', async () => {
    let resolve!: (v: unknown) => void;
    const saveRoster = vi.fn().mockReturnValue(new Promise(r => { resolve = r; }));
    setup(undefined, undefined, { saveRoster });
    await screen.findByRole('heading', { name: 'Raid Night' });

    await userEvent.selectOptions(answer('Cleo'), 'BENCH');
    await userEvent.click(save());

    expect(answer('Cleo')).toBeDisabled();
    expect(confirmBox('Tom')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    resolve({ success: true });
    await waitFor(() => expect(screen.getByText('Roster saved.')).toBeInTheDocument());
  });

  test('discard throws the edits away', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Raid Night' });
    await userEvent.selectOptions(answer('Cleo'), 'BENCH');

    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(answer('Cleo').value).toBe('TENTATIVE');
    expect(save()).toBeDisabled();
  });

  test('warns before leaving the page with unsaved changes, and only then', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Raid Night' });

    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    await userEvent.selectOptions(answer('Cleo'), 'BENCH');
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});

describe('adding characters', () => {
  test('suggests registered characters that are not on the list yet and adds them as IN', async () => {
    const api = setup(undefined, [character('Newbie', { class: 'ROGUE', role: 'DPS' }), character('Zed')]);
    await screen.findByRole('heading', { name: 'Raid Night' });

    const panel = await screen.findByRole('region', { name: 'Add a character' });
    await waitFor(() => expect(within(panel).getByRole('button', { name: /Newbie/ })).toBeInTheDocument());
    expect(within(panel).queryByRole('button', { name: /Zed/ })).not.toBeInTheDocument(); // already on the list

    await userEvent.click(within(panel).getByRole('button', { name: /Newbie/ }));

    expect(answer('Newbie').value).toBe('IN');
    expect(confirmBox('Newbie').checked).toBe(false);
    await userEvent.click(save());
    await waitFor(() => expect(api.saveRoster).toHaveBeenCalledWith('e1', [{ characterId: 'c-Newbie', status: 'IN', isConfirmed: false }]));
  });

  test('filters by character or player name, ignoring case', async () => {
    setup(undefined, [character('Alpha'), character('Bravo')]);
    const panel = await screen.findByRole('region', { name: 'Add a character' });
    await within(panel).findByRole('button', { name: /Alpha/ });

    await userEvent.type(within(panel).getByLabelText(/Search/), 'BRAV');

    expect(within(panel).queryByRole('button', { name: /Alpha/ })).not.toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /Bravo/ })).toBeInTheDocument();

    await userEvent.clear(within(panel).getByLabelText(/Search/));
    await userEvent.type(within(panel).getByLabelText(/Search/), 'alpha_pl');
    expect(within(panel).getByRole('button', { name: /Alpha/ })).toBeInTheDocument();
  });

  test('says when nothing matches or everyone is already listed', async () => {
    setup(undefined, [character('Alpha')]);
    const panel = await screen.findByRole('region', { name: 'Add a character' });
    await within(panel).findByRole('button', { name: /Alpha/ });

    await userEvent.type(within(panel).getByLabelText(/Search/), 'zzz');
    expect(within(panel).getByText('No matching characters.')).toBeInTheDocument();
  });

  test('says when every registered character is already on the list', async () => {
    setup(undefined, []);
    const panel = await screen.findByRole('region', { name: 'Add a character' });
    expect(await within(panel).findByText(/Every registered character is already on the list/)).toBeInTheDocument();
  });

  test('marks alts and keeps the list short with a hint', async () => {
    const many = Array.from({ length: 12 }, (_, i) => character(`Char${String(i).padStart(2, '0')}`, { isMain: i !== 0 }));
    setup(undefined, many);
    const panel = await screen.findByRole('region', { name: 'Add a character' });

    await within(panel).findByRole('button', { name: /Char00/ });
    expect(within(panel).getAllByRole('button')).toHaveLength(8);
    expect(within(panel).getByText(/4 more/)).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /Char00.*\(alt\)/ })).toBeInTheDocument();
  });

  test('a failure to load characters is reported without breaking the page', async () => {
    setup(undefined, undefined, { listCharacters: vi.fn().mockRejectedValue(new Error('db down')) });
    const panel = await screen.findByRole('region', { name: 'Add a character' });

    expect(await within(panel).findByRole('alert')).toHaveTextContent('Could not load characters: db down');
    expect(screen.getByText('Zed')).toBeInTheDocument();
  });
});

describe('publishing', () => {
  test('is disabled with unsaved changes, and says why', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Raid Night' });
    expect(screen.getByRole('button', { name: 'Publish roster' })).toBeEnabled();

    await userEvent.selectOptions(answer('Cleo'), 'BENCH');

    expect(screen.getByRole('button', { name: 'Publish roster' })).toBeDisabled();
    expect(screen.getByText(/Save your changes first/)).toBeInTheDocument();
  });

  test('is disabled until somebody is confirmed', async () => {
    setup(eventDetail({ responses: [response('Cleo', 'HEALER', 'IN', false, 'PRIEST')] }));
    await screen.findByRole('heading', { name: 'Raid Night' });

    expect(screen.getByRole('button', { name: 'Publish roster' })).toBeDisabled();
    expect(screen.getByText(/Confirm at least one player first/)).toBeInTheDocument();
  });

  test('asks for confirmation, naming how many players will be posted', async () => {
    const api = setup();
    await screen.findByRole('heading', { name: 'Raid Night' });

    await userEvent.click(screen.getByRole('button', { name: 'Publish roster' }));

    expect(screen.getByText('Post the roster of 2 players to the channel?')).toBeInTheDocument();
    expect(api.publish).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Publish roster' })).toBeInTheDocument();
  });

  test('uses the singular for a single player', async () => {
    setup(eventDetail({ responses: [response('Tom', 'TANK', 'IN', true, 'WARRIOR')] }));
    await screen.findByRole('heading', { name: 'Raid Night' });

    await userEvent.click(screen.getByRole('button', { name: 'Publish roster' }));

    expect(screen.getByText('Post the roster of 1 player to the channel?')).toBeInTheDocument();
  });

  test('publishes after confirmation and reloads', async () => {
    const api = setup();
    await screen.findByRole('heading', { name: 'Raid Night' });

    await userEvent.click(screen.getByRole('button', { name: 'Publish roster' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, publish' }));

    await waitFor(() => expect(api.publish).toHaveBeenCalledWith('e1'));
    expect(await screen.findByText('Roster published.')).toBeInTheDocument();
    await waitFor(() => expect(api.getEvent).toHaveBeenCalledTimes(2));
  });

  test('when the channel refuses, shows why and leaves the event editable', async () => {
    const publish = vi.fn().mockRejectedValue(new ApiError('Publication failed on every channel', 502));
    setup(undefined, undefined, { publish });
    await screen.findByRole('heading', { name: 'Raid Night' });

    await userEvent.click(screen.getByRole('button', { name: 'Publish roster' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, publish' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Publication failed on every channel');
    expect(screen.getByRole('button', { name: 'Publish roster' })).toBeEnabled();
    expect(answer('Tom')).toBeEnabled();
  });

  test('cannot be triggered twice while publishing', async () => {
    let resolve!: (v: unknown) => void;
    const publish = vi.fn().mockReturnValue(new Promise(r => { resolve = r; }));
    setup(undefined, undefined, { publish });
    await screen.findByRole('heading', { name: 'Raid Night' });

    await userEvent.click(screen.getByRole('button', { name: 'Publish roster' }));
    await userEvent.dblClick(screen.getByRole('button', { name: 'Yes, publish' }));

    expect(publish).toHaveBeenCalledTimes(1);
    resolve({ success: true });
  });
});

describe('published event', () => {
  const published = () => eventDetail({ isPublished: true });

  test('is read-only: no save, add or publish controls, and every input is disabled', async () => {
    setup(published());
    await screen.findByRole('heading', { name: 'Raid Night' });

    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText(/can no longer be changed/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save roster/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish roster' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Add a character' })).not.toBeInTheDocument();
    expect(answer('Tom')).toBeDisabled();
    expect(confirmBox('Tom')).toBeDisabled();
  });

  test('a locked event rejects edits even if the page was opened before it was published', async () => {
    const saveRoster = vi.fn().mockRejectedValue(new ApiError('Event is locked: responses cannot be changed after publication', 409));
    setup(undefined, undefined, { saveRoster });
    await screen.findByRole('heading', { name: 'Raid Night' });

    fireEvent.change(answer('Cleo'), { target: { value: 'BENCH' } });
    await userEvent.click(save());

    expect(await screen.findByRole('alert')).toHaveTextContent(/locked/);
  });
});
