import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ApiError } from '../api';
import { eventDetail, fakeApi, noAnswer, renderWith, response } from '../test/render';
import { EventView } from './EventView';

const full = () =>
  eventDetail({
    responses: [
      response('Tom', 'TANK', 'IN', true, 'WARRIOR'),
      response('Cleo', 'HEALER', 'IN', false, 'PRIEST'),
      response('Rex', 'DPS', 'IN', false, 'ROGUE'),
      response('Zed', 'RANGED_DPS', 'IN', true),
      response('Runner', 'DPS', 'LATE', true, 'ROGUE', '2099-10-18T19:15:00.000Z'),
      response('Benchy', 'TANK', 'BENCH', false, 'WARRIOR'),
      response('Maybe', 'HEALER', 'TENTATIVE', false, 'PRIEST'),
      response('Gone', 'DPS', 'OUT', false, 'ROGUE'),
    ],
    noAnswer: [
      noAnswer('Silent'),
      noAnswer('Ghost', { username: null, reachable: false }),
      noAnswer('Shy', { username: 'shy_player', reachable: false }),
    ],
  });

const setup = (detail = full(), over = {}) => {
  const api = fakeApi({ getEvent: vi.fn().mockResolvedValue(detail), ...over });
  renderWith(<EventView id="e1" />, api);
  return api;
};

const ready = () => screen.findByRole('heading', { name: 'Raid Night' });
const region = (name: string) => screen.getByRole(name.startsWith('No answer') ? 'complementary' : 'region', { name });
const answer = (name: string) => screen.getByLabelText(`Answer for ${name}`) as HTMLSelectElement;
const confirmBox = (name: string) => screen.getByLabelText(`Confirm ${name}`) as HTMLInputElement;
const pick = (name: string) => screen.getByLabelText(`Select ${name} for a message`) as HTMLInputElement;
const save = () => screen.getByRole('button', { name: /Save roster|Saving/ });
const send = () => screen.getByRole('button', { name: /Send to|Sending/ });

describe('the board', () => {
  test('accepted players are split by role, each column with its own count', async () => {
    setup();
    await ready();

    const accepted = region('Accepted (4)');
    expect(within(region('Tank (1)')).getByText('Tom')).toBeInTheDocument();
    expect(within(region('Healer (1)')).getByText('Cleo')).toBeInTheDocument();
    expect(within(region('Melee DPS (1)')).getByText('Rex')).toBeInTheDocument();
    expect(within(region('Ranged DPS (1)')).getByText('Zed')).toBeInTheDocument();
    expect(within(accepted).queryByText('Runner')).not.toBeInTheDocument(); // late is not "accepted"
  });

  test('late players have their own section with the time they arrive', async () => {
    setup();
    await ready();

    const late = region('Late (1)');
    expect(within(late).getByText('Runner')).toBeInTheDocument();
    expect(within(late).getByText('(19:15)')).toBeInTheDocument();
    expect((within(late).getByLabelText('Minutes late for Runner') as HTMLInputElement).value).toBe('15');
  });

  test('bench, tentative and out are listed apart', async () => {
    setup();
    await ready();

    expect(within(region('Bench (1)')).getByText('Benchy')).toBeInTheDocument();
    expect(within(region('Tentative (1)')).getByText('Maybe')).toBeInTheDocument();
    expect(within(region('Out (1)')).getByText('Gone')).toBeInTheDocument();
  });

  test('empty sections say so instead of leaving a hole', async () => {
    setup(eventDetail({ responses: [response('Tom', 'TANK', 'IN', true, 'WARRIOR')], noAnswer: [] }));
    await ready();

    expect(within(region('Late (0)')).getByText('Nobody')).toBeInTheDocument();
    expect(within(region('Healer (0)')).getByText('Nobody yet')).toBeInTheDocument();
  });

  test('every person has the class colour and a specialization or class icon', async () => {
    setup();
    await ready();

    expect(screen.getByText('Tom')).toHaveStyle({ color: 'rgb(199, 156, 110)' }); // warrior
    expect(screen.getByText('Zed')).toHaveStyle({ color: 'rgb(64, 199, 235)' }); // mage
    const tomRow = screen.getByText('Tom').closest('li')!;
    expect(within(tomRow).getByRole('img')).toHaveAttribute('src', '/icons/class/warrior.jpg');
  });

  test('role icons head each column', async () => {
    setup();
    await ready();
    expect(within(region('Tank (1)')).getAllByRole('img', { name: 'Tank' }).length).toBeGreaterThan(0);
  });

  test('the summary counts confirmed players per role and every answer, including no answer', async () => {
    setup();
    await ready();

    const summary = screen.getByRole('list', { name: 'Roster summary' });
    expect(summary).toHaveTextContent('3 confirmed');
    expect(summary).toHaveTextContent('4 in · 1 late · 1 tentative · 1 bench · 1 out · 3 no answer');
  });

  test('shows the answer and confirmation of each person', async () => {
    setup();
    await ready();

    expect(answer('Maybe').value).toBe('TENTATIVE');
    expect(confirmBox('Tom').checked).toBe(true);
    expect(confirmBox('Cleo').checked).toBe(false);
    expect(within(screen.getByText('Tom').closest('li')!).getByText(/@tom_player/)).toBeInTheDocument();
  });

  test('an event nobody answered still shows the whole roster as waiting', async () => {
    setup(eventDetail({ responses: [], noAnswer: [noAnswer('Silent')] }));
    await ready();

    expect(within(region('No answer (1)')).getByText('Silent')).toBeInTheDocument();
    expect(within(region('Accepted (0)')).getAllByText('Nobody yet')).toHaveLength(4);
  });

  test('an unknown event shows the server message and a way back', async () => {
    const api = fakeApi({ getEvent: vi.fn().mockRejectedValue(new ApiError('Event not found', 404)) });
    renderWith(<EventView id="nope" />, api);

    expect(await screen.findByRole('alert')).toHaveTextContent('Event not found');
    expect(screen.getByRole('link', { name: /Back to events/ })).toHaveAttribute('href', '/events');
  });

  test('shows a loading state first', () => {
    renderWith(<EventView id="e1" />, fakeApi({ getEvent: vi.fn().mockReturnValue(new Promise(() => {})) }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading event');
  });
});

describe('no answer panel', () => {
  test('lists the roster members who have not answered, saying who the bot cannot reach', async () => {
    setup();
    await ready();

    const panel = region('No answer (3)');
    expect(within(panel).getByText('Silent')).toBeInTheDocument();
    expect(within(panel).getByText('unclaimed name')).toBeInTheDocument();
    expect(within(panel).getByText('not on the bot yet')).toBeInTheDocument();
    expect(pick('Silent')).toBeEnabled();
    expect(pick('Ghost')).toBeDisabled();
    expect(pick('Shy')).toBeDisabled();
  });

  test('"mark as" records an answer given somewhere else and moves the person onto the board', async () => {
    const api = setup();
    await ready();

    await userEvent.selectOptions(screen.getByLabelText('Mark Silent as'), 'LATE');

    expect(within(region('Late (2)')).getByText('Silent')).toBeInTheDocument();
    expect(within(region('No answer (2)')).queryByText('Silent')).not.toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await userEvent.click(save());
    await waitFor(() => expect(api.saveRoster).toHaveBeenCalledWith('e1', [{ characterId: 'c-Silent', status: 'LATE', isConfirmed: false }]));
  });

  test('says when everybody has answered', async () => {
    setup(eventDetail({ noAnswer: [] }));
    await ready();
    expect(screen.getByText(/Everybody in the roster has answered/)).toBeInTheDocument();
  });

  test('the send button needs at least one person', async () => {
    setup();
    await ready();

    expect(send()).toBeDisabled();
    expect(send()).toHaveTextContent('Send to 0 people');
  });

  test('"select all reachable" ticks only the people the bot can write to', async () => {
    setup();
    await ready();

    await userEvent.click(screen.getByRole('button', { name: /Select all reachable \(1\)/ }));

    expect(pick('Silent').checked).toBe(true);
    expect(pick('Ghost').checked).toBe(false);
    expect(send()).toHaveTextContent('Send to 1 person');
  });

  test('Clear removes the ticks', async () => {
    setup();
    await ready();
    await userEvent.click(pick('Silent'));

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(pick('Silent').checked).toBe(false);
  });

  test('sends the default reminder, and shows what happened to each person', async () => {
    const message = vi.fn().mockResolvedValue({ results: [{ characterId: 'c-Silent', name: 'Silent', status: 'sent' }] });
    const api = setup(undefined, { message });
    await ready();

    await userEvent.click(pick('Silent'));
    await userEvent.click(send());

    await waitFor(() => expect(api.message).toHaveBeenCalledWith('e1', ['c-Silent'], undefined));
    expect(await screen.findByRole('list', { name: 'Message results' })).toHaveTextContent('Silent: sent');
  });

  test('the default text is visible as the placeholder, naming the event and when it is', async () => {
    setup();
    await ready();
    expect(screen.getByLabelText(/Message/)).toHaveAttribute('placeholder', expect.stringMatching(/Raid Night.*Are you coming/));
  });

  test('a custom text replaces the default', async () => {
    const api = setup();
    await ready();

    await userEvent.type(screen.getByLabelText(/Message/), '  We need a tank tonight!  ');
    await userEvent.click(pick('Silent'));
    await userEvent.click(send());

    await waitFor(() => expect(api.message).toHaveBeenCalledWith('e1', ['c-Silent'], 'We need a tank tonight!'));
  });

  test('tentative players can be messaged from the same panel', async () => {
    const api = setup();
    await ready();

    await userEvent.click(pick('Silent'));
    await userEvent.click(pick('Maybe'));
    expect(send()).toHaveTextContent('Send to 2 people');
    await userEvent.click(send());

    await waitFor(() => expect(api.message).toHaveBeenCalledWith('e1', expect.arrayContaining(['c-Silent', 'c-Maybe']), undefined));
  });

  test('somebody ticked and then moved onto the board is no longer messaged', async () => {
    const api = setup();
    await ready();
    await userEvent.click(pick('Silent'));

    await userEvent.selectOptions(screen.getByLabelText('Mark Silent as'), 'IN');

    expect(send()).toHaveTextContent('Send to 0 people');
    expect(api.message).not.toHaveBeenCalled();
  });

  test.each([
    ['unreachable', /has not started the bot/],
    ['unclaimed', /nobody has claimed/],
    ['unknown', /not found/],
  ] as const)('explains a %s recipient', async (status, text) => {
    const message = vi.fn().mockResolvedValue({ results: [{ characterId: 'c-Silent', name: 'Silent', status }] });
    setup(undefined, { message });
    await ready();
    await userEvent.click(pick('Silent'));
    await userEvent.click(send());

    expect(await screen.findByRole('list', { name: 'Message results' })).toHaveTextContent(text);
  });

  test('reports a delivery failure with its reason', async () => {
    const message = vi.fn().mockResolvedValue({ results: [{ characterId: 'c-Silent', name: 'Silent', status: 'failed', error: 'bot was blocked' }] });
    setup(undefined, { message });
    await ready();
    await userEvent.click(pick('Silent'));
    await userEvent.click(send());

    expect(await screen.findByRole('list', { name: 'Message results' })).toHaveTextContent('failed: bot was blocked');
  });

  test('a request that fails altogether shows the error and keeps the selection', async () => {
    const message = vi.fn().mockRejectedValue(new ApiError('Event already published', 409));
    setup(undefined, { message });
    await ready();
    await userEvent.click(pick('Silent'));
    await userEvent.click(send());

    expect(await screen.findByRole('alert')).toHaveTextContent('Event already published');
    expect(pick('Silent').checked).toBe(true);
  });

  test('cannot send twice at once', async () => {
    let resolve!: (v: unknown) => void;
    const message = vi.fn().mockReturnValue(new Promise(r => { resolve = r; }));
    setup(undefined, { message });
    await ready();
    await userEvent.click(pick('Silent'));

    await userEvent.dblClick(send());

    expect(message).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    resolve({ results: [] });
  });
});

describe('editing', () => {
  test('nothing to save until something changes', async () => {
    setup();
    await ready();
    expect(save()).toBeDisabled();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  test('changing an answer moves the person to the right section and marks the roster as changed', async () => {
    setup();
    await ready();

    await userEvent.selectOptions(answer('Maybe'), 'IN');

    expect(within(region('Healer (2)')).getByText('Maybe')).toBeInTheDocument();
    expect(within(region('Tentative (0)')).queryByText('Maybe')).not.toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(save()).toBeEnabled();
  });

  test('confirming someone who said OUT also moves them to IN', async () => {
    setup();
    await ready();

    await userEvent.click(confirmBox('Gone'));

    expect(answer('Gone').value).toBe('IN');
    expect(confirmBox('Gone').checked).toBe(true);
  });

  test('moving a confirmed player out of IN removes the confirmation', async () => {
    setup();
    await ready();

    await userEvent.selectOptions(answer('Tom'), 'OUT');

    expect(confirmBox('Tom').checked).toBe(false);
  });

  test('typing the minutes of a late player updates the arrival time and is saved with the roster', async () => {
    const api = setup();
    await ready();

    const minutes = screen.getByLabelText('Minutes late for Runner');
    await userEvent.clear(minutes);
    await userEvent.type(minutes, '40');

    expect(within(region('Late (1)')).getByText('(19:40)')).toBeInTheDocument();
    await userEvent.click(save());
    await waitFor(() => expect(api.saveRoster).toHaveBeenCalledWith('e1', [{ characterId: 'c-Runner', status: 'LATE', isConfirmed: true, lateMinutes: 40 }]));
  });

  test('clearing the minutes means "not sure how late" and hides the arrival time', async () => {
    setup();
    await ready();

    await userEvent.clear(screen.getByLabelText('Minutes late for Runner'));

    expect(within(region('Late (1)')).queryByText(/\(\d\d:\d\d\)/)).not.toBeInTheDocument();
  });

  test('moving somebody to LATE shows the minutes box', async () => {
    setup();
    await ready();
    expect(screen.queryByLabelText('Minutes late for Rex')).not.toBeInTheDocument();

    await userEvent.selectOptions(answer('Rex'), 'LATE');

    expect(screen.getByLabelText('Minutes late for Rex')).toBeInTheDocument();
  });

  test('saves only the rows that changed, then reloads and confirms', async () => {
    const api = setup();
    await ready();

    await userEvent.click(confirmBox('Cleo'));
    await userEvent.click(save());

    await waitFor(() => expect(api.saveRoster).toHaveBeenCalledWith('e1', [{ characterId: 'c-Cleo', status: 'IN', isConfirmed: true }]));
    expect(await screen.findByText('Roster saved.')).toBeInTheDocument();
    await waitFor(() => expect(api.getEvent).toHaveBeenCalledTimes(2));
  });

  test('after reload the board shows what the server now has', async () => {
    const after = eventDetail({ responses: [response('Tom', 'TANK', 'IN', true, 'WARRIOR'), response('Cleo', 'HEALER', 'IN', true, 'PRIEST')], noAnswer: [] });
    const getEvent = vi.fn().mockResolvedValueOnce(full()).mockResolvedValue(after);
    setup(undefined, { getEvent });
    await ready();

    await userEvent.click(confirmBox('Cleo'));
    await userEvent.click(save());

    await waitFor(() => expect(screen.queryByText('Zed')).not.toBeInTheDocument());
    expect(confirmBox('Cleo').checked).toBe(true);
    expect(save()).toBeDisabled();
  });

  test('a failed save shows the reason and keeps the edits', async () => {
    const saveRoster = vi.fn().mockRejectedValue(new ApiError('Event is locked: responses cannot be changed after publication', 409));
    setup(undefined, { saveRoster });
    await ready();

    await userEvent.selectOptions(answer('Maybe'), 'BENCH');
    await userEvent.click(save());

    expect(await screen.findByRole('alert')).toHaveTextContent('Event is locked');
    expect(answer('Maybe').value).toBe('BENCH');
    expect(save()).toBeEnabled();
  });

  test('controls are locked while saving, so edits cannot race the request', async () => {
    let resolve!: (v: unknown) => void;
    const saveRoster = vi.fn().mockReturnValue(new Promise(r => { resolve = r; }));
    setup(undefined, { saveRoster });
    await ready();

    await userEvent.selectOptions(answer('Maybe'), 'BENCH');
    await userEvent.click(save());

    expect(answer('Maybe')).toBeDisabled();
    expect(confirmBox('Tom')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    resolve({ success: true });
    await waitFor(() => expect(screen.getByText('Roster saved.')).toBeInTheDocument());
  });

  test('discard throws the edits away', async () => {
    setup();
    await ready();
    await userEvent.selectOptions(answer('Maybe'), 'BENCH');

    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(answer('Maybe').value).toBe('TENTATIVE');
    expect(save()).toBeDisabled();
  });

  test('warns before leaving the page with unsaved changes, and only then', async () => {
    setup();
    await ready();

    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    await userEvent.selectOptions(answer('Maybe'), 'BENCH');
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});

describe('publishing', () => {
  const withNote = (r: ReturnType<typeof response>, note: string) => ({ ...r, note });
  const dialog = () => screen.getByRole('dialog', { name: 'Publish the roster' });
  const open = () => userEvent.click(screen.getByRole('button', { name: 'Publish roster' }));

  test('is disabled until somebody is confirmed', async () => {
    setup(eventDetail({ responses: [response('Cleo', 'HEALER', 'IN', false, 'PRIEST')] }));
    await ready();

    expect(screen.getByRole('button', { name: 'Publish roster' })).toBeDisabled();
    expect(screen.getByText(/Confirm at least one player first/)).toBeInTheDocument();
  });

  test('opens a dialog counting confirmed players including late ones; Cancel changes nothing', async () => {
    const api = setup();
    await ready();

    await open();

    expect(within(dialog()).getByText('Post the roster of 3 players to the channel?')).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.saveRoster).not.toHaveBeenCalled();
    expect(api.publish).not.toHaveBeenCalled();
  });

  test('uses the singular for a single player, and with nobody left over saves nothing', async () => {
    const api = setup(eventDetail({ responses: [response('Tom', 'TANK', 'IN', true, 'WARRIOR')] }));
    await ready();

    await open();
    expect(within(dialog()).getByText('Post the roster of 1 player to the channel?')).toBeInTheDocument();
    expect(within(dialog()).queryByRole('radiogroup')).not.toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Yes, publish' }));

    await waitFor(() => expect(api.publish).toHaveBeenCalledWith('e1'));
    expect(api.saveRoster).not.toHaveBeenCalled();
  });

  test('the unconfirmed IN/LATE go to the bench by default, or out, saved before publishing', async () => {
    const order: string[] = [];
    const api = setup(undefined, {
      saveRoster: vi.fn(async () => { order.push('save'); return { success: true }; }),
      publish: vi.fn(async () => { order.push('publish'); return { success: true }; }),
    });
    await ready();

    await open();
    const choice = within(dialog()).getByRole('radiogroup', { name: '2 not confirmed go to' });
    expect(within(choice).getByLabelText('Bench')).toBeChecked();
    await userEvent.click(within(choice).getByLabelText('Out'));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Yes, publish' }));

    await waitFor(() => expect(order).toEqual(['save', 'publish']));
    expect(api.saveRoster).toHaveBeenCalledWith('e1', expect.arrayContaining([
      { characterId: 'c-Cleo', status: 'OUT', isConfirmed: false },
      { characterId: 'c-Rex', status: 'OUT', isConfirmed: false },
    ]));
    expect(await screen.findByText('Roster published.')).toBeInTheDocument();
  });

  test('unsaved board changes go with the publish', async () => {
    const api = setup();
    await ready();

    await userEvent.selectOptions(answer('Maybe'), 'BENCH');
    await open();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Yes, publish' }));

    await waitFor(() => expect(api.saveRoster).toHaveBeenCalledWith('e1', expect.arrayContaining([
      expect.objectContaining({ characterId: 'c-Maybe', status: 'BENCH' }),
    ])));
  });

  test('every answer with a note shows up, confirmed or not, with its tick to change at the last minute', async () => {
    const api = setup(eventDetail({ responses: [
      withNote(response('Ulfgaar', 'TANK', 'IN', true, 'WARRIOR'), 'arriving 21:30, leaving 23:30'),
      response('Tom', 'TANK', 'IN', true, 'WARRIOR'),
      withNote(response('Cleo', 'HEALER', 'TENTATIVE', false, 'PRIEST'), 'maybe, babysitting'),
    ] }));
    await ready();

    await open();
    const notes = within(dialog()).getByRole('list', { name: 'Answers with a note' });
    expect(within(notes).getAllByRole('listitem')).toHaveLength(2);
    expect(within(notes).getByText('arriving 21:30, leaving 23:30')).toBeInTheDocument();

    await userEvent.click(within(notes).getByLabelText('Confirm Ulfgaar'));
    await userEvent.click(within(notes).getByLabelText('Confirm Cleo'));
    expect(within(dialog()).getByText('Post the roster of 2 players to the channel?')).toBeInTheDocument();
    expect(within(dialog()).getByRole('radiogroup', { name: '1 not confirmed go to' })).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Yes, publish' }));

    await waitFor(() => expect(api.saveRoster).toHaveBeenCalledWith('e1', expect.arrayContaining([
      { characterId: 'c-Ulfgaar', status: 'BENCH', isConfirmed: false },
      { characterId: 'c-Cleo', status: 'IN', isConfirmed: true },
    ])));
  });

  test('when the channel refuses, shows why and leaves the event editable', async () => {
    const publish = vi.fn().mockRejectedValue(new ApiError('Publication failed on every channel', 502));
    setup(undefined, { publish });
    await ready();

    await open();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Yes, publish' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Publication failed on every channel');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Publish roster' })).toBeEnabled());
    expect(answer('Tom')).toBeEnabled();
  });

  test('cannot be triggered twice while publishing', async () => {
    let resolve!: (v: unknown) => void;
    const publish = vi.fn().mockReturnValue(new Promise(r => { resolve = r; }));
    setup(eventDetail({ responses: [response('Tom', 'TANK', 'IN', true, 'WARRIOR')] }), { publish });
    await ready();

    await open();
    await userEvent.dblClick(within(dialog()).getByRole('button', { name: 'Yes, publish' }));

    expect(publish).toHaveBeenCalledTimes(1);
    resolve({ success: true });
  });

  test('focus starts on Cancel; Escape closes and gives focus back to the Publish button', async () => {
    setup();
    await ready();
    await open();
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish roster' })).toHaveFocus();
  });

  test('Escape does nothing while publishing', async () => {
    setup(eventDetail({ responses: [response('Tom', 'TANK', 'IN', true, 'WARRIOR')] }), { publish: vi.fn(() => new Promise(() => {})) });
    await ready();
    await open();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Yes, publish' }));

    await userEvent.keyboard('{Escape}');
    expect(dialog()).toBeInTheDocument();
  });

  test('saved but not published: says so and reloads, so the board matches what was saved', async () => {
    const api = setup(undefined, { publish: vi.fn().mockRejectedValue(new ApiError('Publication failed on every channel', 502)) });
    await ready();
    await open();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Yes, publish' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Roster saved, but publishing failed: Publication failed on every channel');
    expect(api.saveRoster).toHaveBeenCalled();
    await waitFor(() => expect(api.getEvent).toHaveBeenCalledTimes(2));
  });

  test('ticking then unticking a TENTATIVE puts back the answer; Cancel leaves the board alone', async () => {
    const api = setup(eventDetail({ responses: [
      response('Tom', 'TANK', 'IN', true, 'WARRIOR'),
      withNote(response('Cleo', 'HEALER', 'TENTATIVE', false, 'PRIEST'), 'maybe'),
    ] }));
    await ready();
    await open();
    const notes = within(dialog()).getByRole('list', { name: 'Answers with a note' });

    await userEvent.click(within(notes).getByLabelText('Confirm Cleo'));
    await userEvent.click(within(notes).getByLabelText('Confirm Cleo'));
    expect(within(notes).getByText('TENTATIVE')).toBeInTheDocument();
    expect(within(notes).getByLabelText('Confirm Cleo')).toHaveAccessibleDescription('maybe');

    await userEvent.click(within(notes).getByLabelText('Confirm Cleo'));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(answer('Cleo')).toHaveValue('TENTATIVE');
    expect(api.saveRoster).not.toHaveBeenCalled();
  });
});

describe('published event', () => {
  test('closed: officers still change the board and publish again; nobody is messaged from the panel', async () => {
    const api = setup(eventDetail({ ...full(), isPublished: true, state: 'CLOSED' }));
    await ready();

    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByText(/publish again to post an update/)).toBeInTheDocument();
    expect(answer('Tom')).toBeEnabled();
    expect(send()).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Publish again' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Publish the roster' })).getByRole('button', { name: 'Yes, publish' }));
    await waitFor(() => expect(api.publish).toHaveBeenCalledWith('e1'));
    expect(await screen.findByText('Update posted.')).toBeInTheDocument();
  });

  test('a change the server refuses shows why', async () => {
    const saveRoster = vi.fn().mockRejectedValue(new ApiError('This event is cancelled', 409));
    setup(undefined, { saveRoster });
    await ready();

    fireEvent.change(answer('Maybe'), { target: { value: 'BENCH' } });
    await userEvent.click(save());

    expect(await screen.findByRole('alert')).toHaveTextContent(/cancelled/);
  });
});

describe('cancel and reopen', () => {
  test('cancel asks first, then tells the server and reloads', async () => {
    const api = setup();
    await ready();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel the event…' }));
    expect(api.cancelEvent).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('group', { name: 'Confirm cancelling' })).getByRole('button', { name: 'Yes, cancel it' }));

    await waitFor(() => expect(api.cancelEvent).toHaveBeenCalledWith('e1'));
    expect(await screen.findByText('Event cancelled.')).toBeInTheDocument();
  });

  test('a cancelled event is frozen and can be reopened before it starts', async () => {
    const api = setup(eventDetail({ ...full(), state: 'CANCELED', canceledAt: '2099-01-01T00:00:00Z' }));
    await ready();

    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(answer('Tom')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Publish/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reopen the event' }));
    await waitFor(() => expect(api.reopenEvent).toHaveBeenCalledWith('e1'));
  });

  test('once started there is no cancel', async () => {
    setup(eventDetail({ ...full(), state: 'STARTED' }));
    await ready();
    expect(screen.queryByRole('region', { name: 'Cancel event' })).not.toBeInTheDocument();
    expect(answer('Tom')).toBeEnabled(); // officers still fix the board
  });
});

describe('nickname and off-specs on the board', () => {
  test('an accepted player shows the nickname and ordered off-spec icons after the main spec', async () => {
    const tom = response('Tom', 'TANK', 'IN', true, 'WARRIOR');
    tom.character.spec = 'PROTECTION';
    tom.character.nickname = 'Matte';
    tom.character.offSpecs = ['FURY', 'ARMS'];
    setup(eventDetail({ responses: [tom], noAnswer: [] }));
    await ready();

    const row = within(region('Tank (1)')).getByText('Tom').closest('li')!;
    expect(within(row).getByText(/Matte/)).toHaveTextContent('· Matte');
    expect(within(row).getByRole('img', { name: 'Protection Warrior' })).toBeInTheDocument();
    expect(within(row).getByRole('group', { name: 'Off-specs: Fury (Melee DPS), Arms (Melee DPS)' })).toBeInTheDocument();
  });

  test("the player's note shows under the name", async () => {
    setup(eventDetail({ responses: [{ ...response('Tom', 'TANK', 'IN', true, 'WARRIOR'), note: 'leaving 30 min early' }], noAnswer: [] }));
    await ready();
    expect(within(region('Tank (1)').querySelector('li')!).getByText('leaving 30 min early')).toHaveClass('person-note');
  });

  test('with a nickname the username is not shown; without one it is', async () => {
    const tom = { ...response('Tom', 'TANK', 'IN', true, 'WARRIOR'), character: { ...response('Tom', 'TANK', 'IN').character, nickname: 'Tommy' } };
    setup(eventDetail({ responses: [tom, response('Zed', 'RANGED_DPS', 'IN', true)], noAnswer: [] }));
    await ready();
    expect(within(region('Tank (1)').querySelector('li')!).queryByText(/@tom_player/)).not.toBeInTheDocument();
    expect(within(region('Ranged DPS (1)').querySelector('li')!).getByText(/@zed_player/)).toBeInTheDocument();
  });

  test('a player without them looks as before', async () => {
    setup(eventDetail({ responses: [response('Zed', 'RANGED_DPS', 'IN', true)], noAnswer: [] }));
    await ready();
    expect(within(region('Ranged DPS (1)').querySelector('li')!).queryByText(/·/)).not.toBeInTheDocument();
  });

  test('the no-answer panel shows them too, and an unknown spec does not crash', async () => {
    setup(eventDetail({ responses: [], noAnswer: [noAnswer('Silent', { nickname: 'Shh', offSpecs: ['FROST', 'NEWSPEC'] })] }));
    await ready();

    const row = within(region('No answer (1)')).getByText('Silent').closest('li')!;
    expect(within(row).getByText(/Shh/)).toHaveTextContent('· Shh');
    expect(within(row).queryByText(/@silent_player/)).not.toBeInTheDocument(); // the nickname is enough
    expect(within(row).getByRole('group', { name: 'Off-specs: Frost (Ranged DPS), NEWSPEC' })).toHaveTextContent('?');
  });
});

describe('reminders', () => {
  test('shows them and saves a change straight away', async () => {
    const api = setup(eventDetail({ reminders: [{ id: 'r1', minutesBefore: 1440, sentAt: '2099-01-01T00:00:00Z' }, { id: 'r2', minutesBefore: 480, sentAt: null }] }), {
      setReminders: vi.fn().mockResolvedValue([{ id: 'r1', minutesBefore: 1440, sentAt: '2099-01-01T00:00:00Z' }]),
    });
    await ready();

    const card = region('Reminders');
    expect(within(card).getByText('1 day before').closest('li')).toHaveTextContent('sent');
    await userEvent.click(within(card).getByRole('button', { name: 'Remove 8 h before' }));

    await waitFor(() => expect(api.setReminders).toHaveBeenCalledWith('e1', [1440]));
    await waitFor(() => expect(within(card).queryByText('8 h before')).not.toBeInTheDocument());
  });

  test('a failed save says why and keeps the old list', async () => {
    setup(eventDetail({ reminders: [{ id: 'r2', minutesBefore: 480, sentAt: null }] }), {
      setReminders: vi.fn().mockRejectedValue(new ApiError('At most 5 reminders', 400)),
    });
    await ready();

    await userEvent.click(within(region('Reminders')).getByRole('button', { name: 'Remove 8 h before' }));

    expect(await within(region('Reminders')).findByRole('alert')).toHaveTextContent('At most 5 reminders');
    expect(within(region('Reminders')).getByText('8 h before')).toBeInTheDocument();
  });

  test('closed once the roster is published', async () => {
    setup(eventDetail({ isPublished: true, reminders: [{ id: 'r2', minutesBefore: 480, sentAt: null }] }));
    await ready();
    const card = region('Reminders');
    expect(within(card).getByText(/no more reminders go out/)).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Remove 8 h before' })).toBeDisabled();
    expect(within(card).getByRole('button', { name: 'Add reminder' })).toBeDisabled();
  });

  test('a reload shows reminders sent in the meantime', async () => {
    const before = eventDetail({ reminders: [{ id: 'r2', minutesBefore: 480, sentAt: null }] });
    const after = eventDetail({ reminders: [{ id: 'r2', minutesBefore: 480, sentAt: '2099-01-01T00:00:00Z' }] });
    setup(before, { getEvent: vi.fn().mockResolvedValueOnce(before).mockResolvedValue(after), saveRoster: vi.fn().mockResolvedValue({ success: true }) });
    await ready();

    await userEvent.selectOptions(answer('Cleo'), 'IN');
    await userEvent.click(save());

    await waitFor(() => expect(within(region('Reminders')).getByText('8 h before').closest('li')).toHaveTextContent('sent'));
  });
});

describe('in-game invites', () => {
  test('only confirmed IN and LATE characters, as /invite macros, follow the board as it changes', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    setup();
    await ready();

    const macro = () => (within(region('In-game invites')).getByRole('textbox', { name: 'Macro 1' }) as HTMLTextAreaElement).value.split('\n');
    // full(): Tom, Zed, Runner (LATE) are confirmed; Cleo and Rex are IN but not confirmed.
    expect(macro()).toEqual(expect.arrayContaining(['/invite Tom-Silvermoon', '/invite Zed-Silvermoon', '/invite Runner-Silvermoon']));
    expect(macro()).toHaveLength(3);

    await userEvent.click(confirmBox('Cleo'));
    expect(macro()).toHaveLength(4);

    await userEvent.click(within(region('In-game invites')).getByRole('button', { name: 'Copy macro 1' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/invite Cleo-Silvermoon'));
  });

  test('also the plain list of names, comma separated, with its own Copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    setup(eventDetail({ responses: [response('Tom', 'TANK', 'IN', true, 'WARRIOR'), response('Zed', 'RANGED_DPS', 'IN', true)] }));
    await ready();

    const invites = region('In-game invites');
    expect(within(invites).getByRole('textbox', { name: 'Names' })).toHaveValue('Tom, Zed');
    expect(within(invites).getByRole('textbox', { name: 'Macro 1' })).toBeInTheDocument();
    await userEvent.click(within(invites).getByRole('button', { name: 'Copy names' }));
    expect(writeText).toHaveBeenCalledWith('Tom, Zed');
  });

  test('nobody confirmed yet: no invites', async () => {
    setup(eventDetail({ responses: [response('Cleo', 'HEALER', 'IN', false, 'PRIEST')] }));
    await ready();
    expect(screen.queryByRole('region', { name: 'In-game invites' })).not.toBeInTheDocument();
  });
});

describe('the spec and character a player brings that night', () => {
  const fardina = (over = {}) => ({
    ...response('Fardina', 'HEALER', 'IN', true, 'PRIEST'),
    character: { ...response('Fardina', 'HEALER', 'IN', true, 'PRIEST').character, spec: 'HOLY', offSpecs: ['SHADOW'] },
    ...over,
  });
  const playsAs = () => screen.getByLabelText('Fardina plays as') as HTMLSelectElement;

  test('an officer moves her to an off-spec: she changes column, and it is saved', async () => {
    const api = setup(eventDetail({ responses: [fardina()] }));
    await ready();
    expect(within(region('Healer (1)')).getByText('Fardina')).toBeInTheDocument();

    await userEvent.selectOptions(playsAs(), 'SHADOW');

    expect(within(region('Ranged DPS (1)')).getByText('Fardina')).toBeInTheDocument();
    expect(within(region('Ranged DPS (1)')).getByRole('img', { name: 'Shadow Priest' })).toBeInTheDocument();
    await userEvent.click(save());
    await waitFor(() => expect(api.saveRoster).toHaveBeenCalledWith('e1', [{ characterId: 'c-Fardina', status: 'IN', isConfirmed: true, spec: 'SHADOW' }]));
  });

  test('an off-spec saved earlier shows in its column; back to the main spec sends null', async () => {
    const api = setup(eventDetail({ responses: [fardina({ spec: 'SHADOW' })] }));
    await ready();
    expect(within(region('Ranged DPS (1)')).getByText('Fardina')).toBeInTheDocument();
    expect(playsAs()).toHaveValue('SHADOW');

    await userEvent.selectOptions(playsAs(), 'HOLY');
    expect(within(region('Healer (1)')).getByText('Fardina')).toBeInTheDocument();
    await userEvent.click(save());
    await waitFor(() => expect(api.saveRoster).toHaveBeenCalledWith('e1', [expect.objectContaining({ characterId: 'c-Fardina', spec: null })]));
  });

  test('no off-specs, no choice', async () => {
    setup(eventDetail({ responses: [response('Tom', 'TANK', 'IN', true, 'WARRIOR')] }));
    await ready();
    expect(screen.queryByLabelText('Tom plays as')).not.toBeInTheDocument();
  });

  test("switching to the player's other character goes to the server at once and reloads", async () => {
    const detail = eventDetail({ responses: [fardina({ alternatives: [{ id: 'c-Bigtank', name: 'Bigtank', class: 'WARRIOR', spec: 'PROTECTION', role: 'TANK' }] })] });
    const api = setup(detail);
    await ready();

    await userEvent.selectOptions(screen.getByLabelText('Switch Fardina to'), 'c-Bigtank');

    await waitFor(() => expect(api.switchCharacter).toHaveBeenCalledWith('e1', 'c-Fardina', 'c-Bigtank'));
    expect(await screen.findByText('Fardina now comes as Bigtank.')).toBeInTheDocument();
    await waitFor(() => expect(api.getEvent).toHaveBeenCalledTimes(2));
  });

  test('switching waits for unsaved changes to be saved', async () => {
    setup(eventDetail({ responses: [
      fardina({ alternatives: [{ id: 'c-Bigtank', name: 'Bigtank', class: 'WARRIOR', spec: 'PROTECTION', role: 'TANK' }] }),
      response('Tom', 'TANK', 'IN', true, 'WARRIOR'),
    ] }));
    await ready();

    await userEvent.selectOptions(answer('Tom'), 'BENCH');
    expect(screen.queryByLabelText('Switch Fardina to')).not.toBeInTheDocument();
    expect(screen.getByText(/save them to switch characters/)).toHaveAttribute('role', 'status');
  });
});

describe('role target', () => {
  const summaryItem = (role: string) => within(screen.getByRole('list', { name: 'Roster summary' })).getAllByTitle(role).find(el => el.tagName === 'LI')!;

  test('the summary shows each count with the target in brackets, marking what is short', async () => {
    // full(): 4 confirmed: Tom (tank), Zed (ranged), Runner (melee, late) + ... flex 2 tanks, 1 per 5 => 1 healer.
    setup(eventDetail({ responses: [response('Tom', 'TANK', 'IN', true, 'WARRIOR'), response('Zed', 'RANGED_DPS', 'IN', true)] }));
    await ready();

    expect(summaryItem('Tank')).toHaveTextContent('1 (2)');
    expect(within(summaryItem('Tank')).getByText('(2)')).toHaveClass('short');
    expect(summaryItem('Ranged DPS')).toHaveTextContent('1 (0)');
    expect(screen.getByText(/guild default/)).toBeInTheDocument();
  });

  test('edit flex for this event: tanks, healers per 5 and the melee/ranged slider', async () => {
    const api = setup();
    await ready();

    await userEvent.click(screen.getByRole('button', { name: 'Edit target' }));
    const form = screen.getByRole('form', { name: 'Role target' });
    await userEvent.clear(within(form).getByLabelText('Tanks'));
    await userEvent.type(within(form).getByLabelText('Tanks'), '3');
    fireEvent.change(within(form).getByLabelText('Melee share'), { target: { value: '30' } });
    expect(within(form).getByText('30% melee · 70% ranged')).toBeInTheDocument();
    await userEvent.click(within(form).getByRole('button', { name: 'Save for this event' }));

    await waitFor(() => expect(api.setEventRoleTarget).toHaveBeenCalledWith('e1', { mode: 'flex', tanks: 3, healersPer5: 1, meleeShare: 30 }));
    await waitFor(() => expect(api.getEvent).toHaveBeenCalledTimes(2));
  });

  test('fixed: melee and ranged stay in the DPS left by the raid size; saved as the guild default', async () => {
    const api = setup();
    await ready();

    await userEvent.click(screen.getByRole('button', { name: 'Edit target' }));
    const form = screen.getByRole('form', { name: 'Role target' });
    await userEvent.click(within(form).getByLabelText('Fixed'));
    await userEvent.clear(within(form).getByLabelText('Raid size'));
    await userEvent.type(within(form).getByLabelText('Raid size'), '20');
    await userEvent.clear(within(form).getByLabelText('Healers'));
    await userEvent.type(within(form).getByLabelText('Healers'), '4');
    expect(within(form).getByText('14 DPS')).toBeInTheDocument();
    await userEvent.clear(within(form).getByLabelText('Melee'));
    await userEvent.type(within(form).getByLabelText('Melee'), '4');
    expect(within(form).getByLabelText('Ranged')).toHaveValue(10);
    await userEvent.click(within(form).getByRole('button', { name: 'Save as guild default' }));

    await waitFor(() => expect(api.setDefaultRoleTarget).toHaveBeenCalledWith({ mode: 'fixed', size: 20, tanks: 2, healers: 4, melee: 4, ranged: 10 }));
  });

  test('switching to fixed keeps the counts adding up, whatever the tanks were', async () => {
    const api = setup(eventDetail({ roleTarget: { mode: 'flex', tanks: 3, healersPer5: 1, meleeShare: 50 }, roleTargetIsDefault: false }));
    await ready();

    await userEvent.click(screen.getByRole('button', { name: 'Edit target' }));
    const form = screen.getByRole('form', { name: 'Role target' });
    await userEvent.click(within(form).getByLabelText('Fixed'));
    expect(within(form).getByText('13 DPS')).toBeInTheDocument();
    await userEvent.clear(within(form).getByLabelText('Raid size'));
    expect(within(form).getByRole('alert')).toHaveTextContent('Set the raid size.');
    expect(within(form).getByRole('button', { name: 'Save for this event' })).toBeDisabled();
    await userEvent.type(within(form).getByLabelText('Raid size'), '5');
    expect(within(form).getByRole('alert')).toHaveTextContent(/more than the raid size/);
    expect(api.setEventRoleTarget).not.toHaveBeenCalled();
  });

  test('with unsaved roster changes the target cannot be saved (the reload would lose them)', async () => {
    setup();
    await ready();

    await userEvent.selectOptions(answer('Maybe'), 'BENCH');
    await userEvent.click(screen.getByRole('button', { name: 'Edit target' }));
    const form = screen.getByRole('form', { name: 'Role target' });

    expect(within(form).getByRole('button', { name: 'Save for this event' })).toBeDisabled();
    expect(within(form).getByRole('button', { name: 'Save for this event' })).toHaveAccessibleDescription(/Save the roster first/);
  });

  test('an event with its own target can go back to the guild default', async () => {
    const api = setup(eventDetail({ roleTarget: { mode: 'flex', tanks: 1, healersPer5: 1, meleeShare: 50 }, roleTargetIsDefault: false }));
    await ready();

    await userEvent.click(screen.getByRole('button', { name: 'Use the guild default' }));
    await waitFor(() => expect(api.setEventRoleTarget).toHaveBeenCalledWith('e1', null));
  });

  test('a role short of its target highlights who can cover it with an off-spec', async () => {
    const fardina = { ...response('Fardina', 'HEALER', 'IN', true, 'PRIEST'), character: { ...response('Fardina', 'HEALER', 'IN', true, 'PRIEST').character, spec: 'HOLY', offSpecs: ['SHADOW'] } };
    setup(eventDetail({
      roleTarget: { mode: 'fixed', size: 3, tanks: 1, healers: 0, melee: 0, ranged: 2 }, roleTargetIsDefault: false,
      responses: [response('Tom', 'TANK', 'IN', true, 'WARRIOR'), response('Zed', 'RANGED_DPS', 'IN', true), fardina],
    }));
    await ready();

    expect(within(region('Healer (1)')).getByText(/can cover/)).toHaveTextContent('can cover Ranged DPS');
  });
});
