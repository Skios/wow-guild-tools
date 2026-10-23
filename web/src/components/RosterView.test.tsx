import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from '../api';
import type { RosterCharacter } from '../types';
import { OFFICER, fakeApi, renderWith } from '../test/render';
import { RosterView } from './RosterView';

afterEach(() => vi.restoreAllMocks());

const member = (name: string, over: Partial<RosterCharacter> = {}): RosterCharacter => ({
  id: `c-${name}`, name, realm: 'Silvermoon', class: 'MAGE', spec: 'FIRE', role: 'RANGED_DPS', claimed: false, username: null, offSpecs: [], nickname: null,
  isMain: false, ...over,
});

const RAID_LEADER = { ...OFFICER, role: 'Raidleader', capabilities: ['events.manage', 'messages.send', 'roster.approve'] };

const setup = (people = [member('Jaina')], over = {}, officer = OFFICER) => {
  const api = fakeApi({ listRoster: vi.fn().mockResolvedValue(people), ...over });
  renderWith(<RosterView />, api, undefined, officer);
  return api;
};

const rowOf = (name: string) => screen.getByText(name).closest('tr')!;
const addForm = () => screen.getByRole('form', { name: 'Add to roster' });
const fill = async (form: HTMLElement, v: { name?: string; realm?: string; cls?: string; spec?: string }) => {
  if (v.name !== undefined) await userEvent.type(within(form).getByLabelText('Character'), v.name);
  if (v.realm !== undefined) { await userEvent.clear(within(form).getByLabelText('Realm')); await userEvent.type(within(form).getByLabelText('Realm'), v.realm); }
  if (v.cls) await userEvent.selectOptions(within(form).getByLabelText('Class'), v.cls);
  if (v.spec) await userEvent.selectOptions(within(form).getByLabelText('Specialization'), v.spec);
};

describe('the roster list', () => {
  test('shows each character with class, role and whether a player has taken the name', async () => {
    setup([
      member('Jaina', { claimed: true, username: 'jaina_player' }),
      member('Brannock', { class: 'WARRIOR', spec: 'PROTECTION', role: 'TANK' }),
    ]);

    await screen.findByText('Jaina');
    const jaina = rowOf('Jaina');
    expect(within(jaina).getByText('Fire Mage')).toBeInTheDocument();
    expect(within(jaina).getByText('jaina_player')).toBeInTheDocument();
    expect(within(jaina).getByText('Silvermoon')).toBeInTheDocument();
    expect(within(rowOf('Brannock')).getByText('Waiting for a player')).toBeInTheDocument();
    expect(within(rowOf('Brannock')).getByText('Protection Warrior')).toBeInTheDocument();
  });

  test('is ordered tank, healer, melee, ranged, then by name', async () => {
    setup([
      member('Zed'), member('Amy', { class: 'ROGUE', spec: 'OUTLAW', role: 'DPS' }),
      member('Cleo', { class: 'PRIEST', spec: 'HOLY', role: 'HEALER' }), member('Tom', { class: 'WARRIOR', spec: 'PROTECTION', role: 'TANK' }),
    ]);

    await screen.findByText('Zed');
    const names = within(screen.getByRole('region', { name: 'Roster characters' })).getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell')[0]!.textContent);
    expect(names).toEqual(['Tom', 'Cleo', 'Amy', 'Zed']);
  });

  test('totals: characters, linked to a player, waiting, and per role', async () => {
    setup([member('A', { claimed: true, username: 'a' }), member('B'), member('C', { class: 'WARRIOR', spec: 'PROTECTION', role: 'TANK' })]);

    await screen.findByText('A');
    const totals = screen.getByRole('list', { name: 'Roster totals' });
    expect(totals).toHaveTextContent('3 characters');
    expect(totals).toHaveTextContent('1 linked to a player');
    expect(totals).toHaveTextContent('2 waiting');
  });

  test('an empty roster says how to start', async () => {
    setup([]);
    expect(await screen.findByText(/The roster is empty/)).toBeInTheDocument();
  });

  test('a failure to load is shown', async () => {
    setup([], { listRoster: vi.fn().mockRejectedValue(new ApiError('Cannot reach the server', 0)) });
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
  });

  test('shows a loading state', () => {
    setup([], { listRoster: vi.fn().mockReturnValue(new Promise(() => {})) });
    expect(screen.getByRole('status')).toHaveTextContent('Loading the roster');
  });
});

describe('adding a character', () => {
  test('sends the entry, confirms, refreshes the list and keeps the realm for the next one', async () => {
    const api = setup([]);
    await screen.findByText(/roster is empty/);

    await fill(addForm(), { name: 'Brannock', realm: 'Silvermoon', cls: 'WARRIOR', spec: 'PROTECTION' });
    await userEvent.click(within(addForm()).getByRole('button', { name: 'Add to roster' }));

    await waitFor(() => expect(api.addToRoster).toHaveBeenCalledWith({ name: 'Brannock', realm: 'Silvermoon', class: 'WARRIOR', spec: 'PROTECTION', offSpecs: [], nickname: null }));
    expect(await screen.findByText('Brannock added to the roster.')).toBeInTheDocument();
    await waitFor(() => expect(api.listRoster).toHaveBeenCalledTimes(2));
    expect(within(addForm()).getByLabelText('Character')).toHaveValue('');
    expect(within(addForm()).getByLabelText('Realm')).toHaveValue('Silvermoon');
    expect(within(addForm()).getByLabelText('Class')).toHaveValue('');
  });

  test('the realm of the last entry is remembered after a reload', async () => {
    const first = setup([]);
    await screen.findByText(/roster is empty/);
    await fill(addForm(), { name: 'Brannock', realm: "Mal'Ganis", cls: 'WARRIOR', spec: 'PROTECTION' });
    await userEvent.click(within(addForm()).getByRole('button', { name: 'Add to roster' }));
    await waitFor(() => expect(first.addToRoster).toHaveBeenCalled());
    document.body.innerHTML = '';

    setup([]);
    await screen.findByText(/roster is empty/);
    expect(within(addForm()).getByLabelText('Realm')).toHaveValue("Mal'Ganis");
  });

  test('the specialization list follows the class, and changing the class clears it', async () => {
    setup([]);
    await screen.findByText(/roster is empty/);
    const form = addForm();
    expect(within(form).getByLabelText('Specialization')).toBeDisabled();

    await userEvent.selectOptions(within(form).getByLabelText('Class'), 'MAGE');
    expect(within(within(form).getByLabelText('Specialization')).getAllByRole('option').map(o => o.textContent)).toEqual(['Choose…', 'Arcane', 'Fire', 'Frost']);

    await userEvent.selectOptions(within(form).getByLabelText('Specialization'), 'FIRE');
    await userEvent.selectOptions(within(form).getByLabelText('Class'), 'WARRIOR');
    expect(within(form).getByLabelText('Specialization')).toHaveValue('');
  });

  test('blocks an incomplete entry and points at every field, without calling the API', async () => {
    const api = setup([]);
    await screen.findByText(/roster is empty/);

    await userEvent.click(within(addForm()).getByRole('button', { name: 'Add to roster' }));

    expect(screen.getByText('Names are 2 to 12 letters')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid realm name')).toBeInTheDocument();
    expect(screen.getByText('Choose a class')).toBeInTheDocument();
    expect(within(addForm()).getByLabelText('Character')).toHaveAttribute('aria-invalid', 'true');
    expect(api.addToRoster).not.toHaveBeenCalled();
  });

  test('shows the server message when the character already exists and keeps the form filled', async () => {
    const addToRoster = vi.fn().mockRejectedValue(new ApiError('Character is already in the roster', 409));
    setup([], { addToRoster });
    await screen.findByText(/roster is empty/);

    await fill(addForm(), { name: 'Jaina', realm: 'Silvermoon', cls: 'MAGE', spec: 'FIRE' });
    await userEvent.click(within(addForm()).getByRole('button', { name: 'Add to roster' }));

    expect(await within(addForm()).findByRole('alert')).toHaveTextContent('Character is already in the roster');
    expect(within(addForm()).getByLabelText('Character')).toHaveValue('Jaina');
  });

  test('double clicking adds once', async () => {
    let resolve!: (v: unknown) => void;
    const addToRoster = vi.fn().mockReturnValue(new Promise(r => { resolve = r; }));
    setup([], { addToRoster });
    await screen.findByText(/roster is empty/);
    await fill(addForm(), { name: 'Jaina', realm: 'Silvermoon', cls: 'MAGE', spec: 'FIRE' });

    await userEvent.dblClick(within(addForm()).getByRole('button', { name: 'Add to roster' }));

    expect(addToRoster).toHaveBeenCalledTimes(1);
    resolve({});
  });

  test('works when browser storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const api = setup([]);
    await screen.findByText(/roster is empty/);
    await fill(addForm(), { name: 'Jaina', realm: 'Silvermoon', cls: 'MAGE', spec: 'FIRE' });

    await userEvent.click(within(addForm()).getByRole('button', { name: 'Add to roster' }));

    await waitFor(() => expect(api.addToRoster).toHaveBeenCalled());
  });
});

describe('editing', () => {
  test('opens a form with the current values and saves the changes', async () => {
    const api = setup();
    await screen.findByText('Jaina');

    await userEvent.click(screen.getByRole('button', { name: 'Edit Jaina' }));
    const form = screen.getByRole('form', { name: 'Save changes' });
    expect(within(form).getByLabelText('Character')).toHaveValue('Jaina');
    expect(within(form).getByLabelText('Specialization')).toHaveValue('FIRE');

    await userEvent.selectOptions(within(form).getByLabelText('Specialization'), 'FROST');
    await userEvent.click(within(form).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.updateRosterEntry).toHaveBeenCalledWith('c-Jaina', { name: 'Jaina', realm: 'Silvermoon', class: 'MAGE', spec: 'FROST', offSpecs: [], nickname: null }));
    expect(await screen.findByText('Jaina updated.')).toBeInTheDocument();
  });

  test('cancel closes the form without saving', async () => {
    const api = setup();
    await screen.findByText('Jaina');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Jaina' }));

    await userEvent.click(within(screen.getByRole('form', { name: 'Save changes' })).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('form', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(api.updateRosterEntry).not.toHaveBeenCalled();
  });

  test('a rename onto an existing character shows the conflict', async () => {
    const updateRosterEntry = vi.fn().mockRejectedValue(new ApiError('Already exists', 409));
    setup([member('Jaina')], { updateRosterEntry });
    await screen.findByText('Jaina');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Jaina' }));

    await userEvent.click(within(screen.getByRole('form', { name: 'Save changes' })).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Already exists');
  });
});

describe('removing and releasing', () => {
  test("a player's character is not removed but taken off the roster (revoked): the player keeps it", async () => {
    const api = setup([member('Jaina', { claimed: true, username: 'jp' })]);
    await screen.findByText('Jaina');
    expect(screen.queryByRole('button', { name: 'Remove Jaina' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Revoke Jaina' }));
    expect(screen.getByText(/Take Jaina off the roster\? The player keeps it/)).toBeInTheDocument();
    expect(api.revokeRoster).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('group', { name: 'Confirm for Jaina' })).getByRole('button', { name: 'Yes' }));

    await waitFor(() => expect(api.revokeRoster).toHaveBeenCalledWith('c-Jaina'));
    expect(await screen.findByText('Jaina is waiting for approval again.')).toBeInTheDocument();
  });

  test('removing an unclaimed name does not mention a player', async () => {
    setup();
    await screen.findByText('Jaina');
    await userEvent.click(screen.getByRole('button', { name: 'Remove Jaina' }));
    expect(screen.getByText('Remove Jaina from the roster?')).toBeInTheDocument();
  });

  test('confirming removes the character and refreshes', async () => {
    const api = setup();
    await screen.findByText('Jaina');

    await userEvent.click(screen.getByRole('button', { name: 'Remove Jaina' }));
    await userEvent.click(within(screen.getByRole('group', { name: 'Confirm for Jaina' })).getByRole('button', { name: 'Yes' }));

    await waitFor(() => expect(api.removeFromRoster).toHaveBeenCalledWith('c-Jaina'));
    expect(await screen.findByText('Jaina removed from the roster.')).toBeInTheDocument();
    await waitFor(() => expect(api.listRoster).toHaveBeenCalledTimes(2));
  });

  test('cancelling leaves everything as it was', async () => {
    const api = setup();
    await screen.findByText('Jaina');
    await userEvent.click(screen.getByRole('button', { name: 'Remove Jaina' }));

    await userEvent.click(within(screen.getByRole('group', { name: 'Confirm for Jaina' })).getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Remove Jaina' })).toBeInTheDocument();
    expect(api.removeFromRoster).not.toHaveBeenCalled();
  });

  test('only a claimed name can be released, and it frees the name for another player', async () => {
    const api = setup([member('Jaina', { claimed: true, username: 'jp' }), member('Brannock')]);
    await screen.findByText('Jaina');
    expect(screen.queryByRole('button', { name: 'Release Brannock' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Release Jaina' }));
    expect(screen.getByText(/Free Jaina so another player can take it/)).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('group', { name: 'Confirm for Jaina' })).getByRole('button', { name: 'Yes' }));

    await waitFor(() => expect(api.releaseRosterEntry).toHaveBeenCalledWith('c-Jaina'));
    expect(await screen.findByText('Jaina is free to be claimed again.')).toBeInTheDocument();
  });

  test('a failed removal shows the reason and keeps the row', async () => {
    const removeFromRoster = vi.fn().mockRejectedValue(new ApiError('Character is not in the roster', 404));
    setup([member('Jaina')], { removeFromRoster });
    await screen.findByText('Jaina');

    await userEvent.click(screen.getByRole('button', { name: 'Remove Jaina' }));
    await userEvent.click(within(screen.getByRole('group', { name: 'Confirm for Jaina' })).getByRole('button', { name: 'Yes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Character is not in the roster');
    expect(screen.getByText('Jaina')).toBeInTheDocument();
  });
});

describe('nickname and off-specs in the list', () => {
  test('the nickname sits next to the name and the off-spec icons follow the main spec in order', async () => {
    setup([member('Brannock', { class: 'WARRIOR', spec: 'PROTECTION', role: 'TANK', nickname: 'Matte', offSpecs: ['FURY', 'ARMS'] })]);

    await screen.findByText('Brannock');
    const row = rowOf('Brannock');
    expect(within(row).getByText(/Matte/)).toHaveTextContent('· Matte');
    expect(within(row).getByRole('group', { name: 'Off-specs: Fury (Melee DPS), Arms (Melee DPS)' })).toBeInTheDocument();
    const icons = row.querySelectorAll('.role-cell > :is(img, svg, .offspecs)');
    expect(icons[0]).toHaveAccessibleName('Protection Warrior');
    expect(icons[1]).toHaveClass('offspecs');
  });

  test('an unknown off-spec from a newer server does not break the row', async () => {
    setup([member('Jaina', { offSpecs: ['NEWSPEC'] })]);
    await screen.findByText('Jaina');
    expect(within(rowOf('Jaina')).getByRole('group', { name: 'Off-specs: NEWSPEC' })).toHaveTextContent('?');
  });
});

describe('the nickname and off-spec fields', () => {
  const offSpecList = (form: HTMLElement) => within(within(form).getByRole('list', { name: 'Off-specs in order' })).queryAllByRole('listitem').map(li => li.textContent);
  const offSpecOptions = (form: HTMLElement) =>
    within(within(form).getByLabelText('Add an off-spec')).getAllByRole('option').map(o => o.textContent);
  const announcement = (form: HTMLElement) => form.querySelector('[aria-live="polite"]')!.textContent;
  const addOffSpec = (form: HTMLElement, id: string) => userEvent.selectOptions(within(form).getByLabelText('Add an off-spec'), id);
  const fillWarrior = (form: HTMLElement) => fill(form, { name: 'Brannock', realm: 'Silvermoon', cls: 'WARRIOR', spec: 'PROTECTION' });

  test('offers the other specs of the class with their role, and adds them in order', async () => {
    setup([]);
    await screen.findByText(/roster is empty/);
    const form = addForm();
    expect(within(form).getByLabelText('Add an off-spec')).toBeDisabled();

    await fillWarrior(form);
    expect(offSpecOptions(form)).toEqual(['Add an off-spec…', 'Arms (Melee DPS)', 'Fury (Melee DPS)']);

    await addOffSpec(form, 'FURY');
    await addOffSpec(form, 'ARMS');
    expect(offSpecList(form)[0]).toContain('#2');
    expect(offSpecList(form)[1]).toContain('#3');
    expect(offSpecList(form)[0]).toContain('Fury (Melee DPS)');
    expect(offSpecList(form)[1]).toContain('Arms (Melee DPS)');
    expect(within(form).getByLabelText('Add an off-spec')).toBeDisabled();
  });

  test('moves an off-spec up and down, and removes one', async () => {
    setup([]);
    await screen.findByText(/roster is empty/);
    const form = addForm();
    await fillWarrior(form);
    await addOffSpec(form, 'FURY');
    await addOffSpec(form, 'ARMS');

    expect(within(form).getByRole('button', { name: 'Move Fury up' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(form).getByRole('button', { name: 'Move Arms down' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(form).getByRole('button', { name: 'Move Fury down' })).not.toHaveAttribute('aria-disabled');

    await userEvent.click(within(form).getByRole('button', { name: 'Move Arms up' }));
    expect(offSpecList(form)[0]).toContain('Arms');
    await userEvent.click(within(form).getByRole('button', { name: 'Move Arms down' }));
    expect(offSpecList(form)[0]).toContain('Fury');

    await userEvent.click(within(form).getByRole('button', { name: 'Remove Fury from off-specs' }));
    expect(offSpecList(form)).toHaveLength(1);
    expect(offSpecList(form)[0]).toContain('#2');
    expect(offSpecOptions(form)).toContain('Fury (Melee DPS)');
  });

  test('changing the class clears the off-specs; changing the main spec drops it from them', async () => {
    setup([]);
    await screen.findByText(/roster is empty/);
    const form = addForm();
    await fillWarrior(form);
    await addOffSpec(form, 'FURY');
    await addOffSpec(form, 'ARMS');

    await userEvent.selectOptions(within(form).getByLabelText('Specialization'), 'FURY');
    expect(offSpecList(form)).toHaveLength(1);
    expect(offSpecList(form)[0]).toContain('#2');
    expect(offSpecList(form)[0]).toContain('Arms');

    await userEvent.selectOptions(within(form).getByLabelText('Class'), 'MAGE');
    expect(offSpecList(form)).toEqual([]);
    expect(within(form).getByLabelText('Add an off-spec')).toBeEnabled();
  });

  test('sends the off-specs in order and the trimmed nickname, then clears them', async () => {
    const api = setup([]);
    await screen.findByText(/roster is empty/);
    const form = addForm();
    await fillWarrior(form);
    await addOffSpec(form, 'ARMS');
    await addOffSpec(form, 'FURY');
    await userEvent.type(within(form).getByLabelText('Nickname (optional)'), '  Matte ');
    await userEvent.click(within(form).getByRole('button', { name: 'Add to roster' }));

    await waitFor(() => expect(api.addToRoster).toHaveBeenCalledWith({
      name: 'Brannock', realm: 'Silvermoon', class: 'WARRIOR', spec: 'PROTECTION', offSpecs: ['ARMS', 'FURY'], nickname: 'Matte',
    }));
    await waitFor(() => expect(within(form).getByLabelText('Nickname (optional)')).toHaveValue(''));
    expect(offSpecList(form)).toEqual([]);
  });

  test('a bad nickname is flagged and nothing is sent', async () => {
    const api = setup([]);
    await screen.findByText(/roster is empty/);
    const form = addForm();
    await fillWarrior(form);
    await userEvent.type(within(form).getByLabelText('Nickname (optional)'), 'Matte!');
    await userEvent.click(within(form).getByRole('button', { name: 'Add to roster' }));

    expect(within(form).getByLabelText('Nickname (optional)')).toHaveAttribute('aria-invalid', 'true');
    expect(within(form).getByText(/Up to 24/)).toBeInTheDocument();
    expect(api.addToRoster).not.toHaveBeenCalled();
  });

  test('editing starts from the saved off-specs and nickname', async () => {
    const api = setup([member('Brannock', { class: 'WARRIOR', spec: 'PROTECTION', role: 'TANK', nickname: 'Matte', offSpecs: ['FURY'] })]);
    await screen.findByText('Brannock');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Brannock' }));
    const form = screen.getByRole('form', { name: 'Save changes' });

    expect(within(form).getByLabelText('Nickname (optional)')).toHaveValue('Matte');
    expect(offSpecList(form)[0]).toContain('Fury');
    await userEvent.click(within(form).getByRole('button', { name: 'Remove Fury from off-specs' }));
    await userEvent.clear(within(form).getByLabelText('Nickname (optional)'));
    await userEvent.click(within(form).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.updateRosterEntry).toHaveBeenCalledWith('c-Brannock', {
      name: 'Brannock', realm: 'Silvermoon', class: 'WARRIOR', spec: 'PROTECTION', offSpecs: [], nickname: null,
    }));
  });

  test('an unknown saved off-spec is shown, blocks saving, and can be removed', async () => {
    const api = setup([member('Jaina', { offSpecs: ['NEWSPEC'] })]);
    await screen.findByText('Jaina');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Jaina' }));
    const form = screen.getByRole('form', { name: 'Save changes' });

    expect(offSpecList(form)[0]).toContain('NEWSPEC');
    await userEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(within(form).getByText(/Off-specs must be different Mage/)).toBeInTheDocument();
    expect(api.updateRosterEntry).not.toHaveBeenCalled();

    await userEvent.click(within(form).getByRole('button', { name: 'Remove NEWSPEC from off-specs' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.updateRosterEntry).toHaveBeenCalled());
  });

  test('edge buttons stay focusable and do nothing', async () => {
    setup([]);
    await screen.findByText(/roster is empty/);
    const form = addForm();
    await fillWarrior(form);
    await addOffSpec(form, 'FURY');
    await addOffSpec(form, 'ARMS');

    const up = within(form).getByRole('button', { name: 'Move Fury up' });
    await userEvent.click(up);
    expect(up).toHaveFocus();
    expect(offSpecList(form)[0]).toContain('Fury');
    expect(announcement(form)).toBe('Added Arms');
  });

  test('focus stays on the moved item', async () => {
    setup([]);
    await screen.findByText(/roster is empty/);
    const form = addForm();
    await fillWarrior(form);
    await addOffSpec(form, 'FURY');
    await addOffSpec(form, 'ARMS');

    await userEvent.click(within(form).getByRole('button', { name: 'Move Arms up' }));
    expect(within(form).getByRole('button', { name: 'Move Arms up' })).toHaveFocus();
    await userEvent.click(within(form).getByRole('button', { name: 'Move Arms down' }));
    expect(within(form).getByRole('button', { name: 'Move Arms down' })).toHaveFocus();
  });

  test('after removing, focus goes to the next remove button, else the previous, else the add select', async () => {
    setup([]);
    await screen.findByText(/roster is empty/);
    const form = addForm();
    await fillWarrior(form);
    await addOffSpec(form, 'FURY');
    await addOffSpec(form, 'ARMS');
    const remove = (name: string) => within(form).getByRole('button', { name: `Remove ${name} from off-specs` });

    await userEvent.click(remove('Fury'));
    expect(remove('Arms')).toHaveFocus();
    await addOffSpec(form, 'FURY');
    await userEvent.click(remove('Fury')); // last item: previous one
    expect(remove('Arms')).toHaveFocus();
    await userEvent.click(remove('Arms')); // only item: back to the select
    expect(within(form).getByLabelText('Add an off-spec')).toHaveFocus();
  });

  test('announces what happened in a polite live region', async () => {
    setup([]);
    await screen.findByText(/roster is empty/);
    const form = addForm();
    await fillWarrior(form);
    expect(within(form).getByText('', { selector: '[aria-live="polite"]' })).toBeInTheDocument();

    await addOffSpec(form, 'FURY');
    expect(announcement(form)).toBe('Added Fury');
    await addOffSpec(form, 'ARMS');
    await userEvent.click(within(form).getByRole('button', { name: 'Move Arms up' }));
    expect(announcement(form)).toBe('Moved Arms up');
    await userEvent.click(within(form).getByRole('button', { name: 'Move Arms down' }));
    expect(announcement(form)).toBe('Moved Arms down');
    await userEvent.click(within(form).getByRole('button', { name: 'Remove Fury from off-specs' }));
    expect(announcement(form)).toBe('Removed Fury');
  });

  test('an off-spec error is tied to the add select, not flagged on the fieldset', async () => {
    setup([member('Jaina', { offSpecs: ['NEWSPEC'] })]);
    await screen.findByText('Jaina');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Jaina' }));
    const form = screen.getByRole('form', { name: 'Save changes' });
    await userEvent.click(within(form).getByRole('button', { name: 'Save changes' }));

    const select = within(form).getByLabelText('Add an off-spec');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription(/Off-specs must be different/);
    expect(within(form).getByRole('group', { name: /Off-specs, in order/ })).not.toHaveAttribute('aria-invalid');
  });
});

describe('assigning a roster name to an account', () => {
  test('an officer gives a free name to an account', async () => {
    const api = setup([member('Brannock')], {
      rosterAccounts: vi.fn().mockResolvedValue([{ id: 'u7', username: 'mrcid', nickname: 'Matte' }]),
    });
    await screen.findByText('Brannock');

    await userEvent.selectOptions(within(rowOf('Brannock')).getByRole('combobox', { name: 'Assign Brannock to an account' }), 'u7');

    expect(api.assignRosterOwner).toHaveBeenCalledWith('c-Brannock', 'u7');
    expect(await screen.findByRole('status')).toHaveTextContent('Brannock is now Matte’s.');
  });

  test('a claimed name has no assign menu (release it first)', async () => {
    setup([member('Jaina', { claimed: true, username: 'jaina_player' })], {
      rosterAccounts: vi.fn().mockResolvedValue([{ id: 'u7', username: 'mrcid', nickname: null }]),
    });
    await screen.findByText('Jaina');
    expect(within(rowOf('Jaina')).queryByRole('combobox')).not.toBeInTheDocument();
  });
});

describe('grouped by player', () => {
  test("a player's alts follow their main, indented; the player column shows the nickname, else the username", async () => {
    setup([
      member('Zalt', { claimed: true, username: 'cid', nickname: 'Ulfy', role: 'TANK', class: 'WARRIOR', spec: 'PROTECTION' }),
      member('Main', { claimed: true, username: 'cid', nickname: 'Ulfy', isMain: true }),
      member('Solo', { claimed: true, username: 'solo' }),
      member('Free'),
    ]);

    await screen.findByText('Main');
    const rows = within(screen.getByRole('region', { name: 'Roster characters' })).getAllByRole('row').slice(1);
    const names = rows.map(r => within(r).getAllByRole('cell')[0]!.textContent);
    expect(names.indexOf('Zalt')).toBe(names.indexOf('Main') + 1);
    expect(rowOf('Zalt')).toHaveClass('alt-row');
    expect(rowOf('Main')).not.toHaveClass('alt-row');
    expect(within(rowOf('Main')).getByText('Ulfy')).toBeInTheDocument();
    expect(within(rowOf('Main')).queryByText(/cid/)).not.toBeInTheDocument();
    expect(within(rowOf('Solo')).getByText('solo')).toBeInTheDocument();
  });

  test("editing a player's character has no nickname field (it belongs to the account)", async () => {
    setup([member('Jaina', { claimed: true, username: 'jp' })]);
    await screen.findByText('Jaina');

    await userEvent.click(screen.getByRole('button', { name: 'Edit Jaina' }));

    expect(within(screen.getByRole('form', { name: 'Save changes' })).queryByLabelText('Nickname (optional)')).not.toBeInTheDocument();
  });
});

describe('characters waiting for approval', () => {
  const waiting = member('Kerlink', { claimed: true, username: 'cid', nickname: 'Ulfy', class: 'PALADIN', spec: 'PROTECTION', role: 'TANK' });
  const pendingList = () => screen.getByRole('region', { name: 'Waiting for approval' });

  test('are listed with their player; approving puts them on the roster', async () => {
    const api = setup([], { listPendingRoster: vi.fn().mockResolvedValue([waiting]) });

    await within(await screen.findByRole('region', { name: 'Waiting for approval' })).findByText('Kerlink');
    expect(within(pendingList()).getByText('Ulfy')).toBeInTheDocument();
    await userEvent.click(within(pendingList()).getByRole('button', { name: 'Approve Kerlink' }));

    await waitFor(() => expect(api.approveRoster).toHaveBeenCalledWith('c-Kerlink'));
    expect(await screen.findByText('Kerlink is on the roster.')).toBeInTheDocument();
    await waitFor(() => expect(api.listRoster).toHaveBeenCalledTimes(2));
    expect(api.listPendingRoster).toHaveBeenCalledTimes(2);
  });

  test('rejecting asks first, then takes the character from the player', async () => {
    const api = setup([], { listPendingRoster: vi.fn().mockResolvedValue([waiting]) });
    await within(await screen.findByRole('region', { name: 'Waiting for approval' })).findByText('Kerlink');

    await userEvent.click(within(pendingList()).getByRole('button', { name: 'Reject Kerlink' }));
    expect(api.rejectPending).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('group', { name: 'Confirm rejecting Kerlink' })).getByRole('button', { name: 'Yes' }));

    await waitFor(() => expect(api.rejectPending).toHaveBeenCalledWith('c-Kerlink'));
    expect(await screen.findByText('Kerlink rejected.')).toBeInTheDocument();
  });

  test('can be given to another account (a name someone took that is not theirs)', async () => {
    const api = setup([], {
      listPendingRoster: vi.fn().mockResolvedValue([waiting]),
      rosterAccounts: vi.fn().mockResolvedValue([{ id: 'u2', username: 'thrall', nickname: null }]),
    });
    await within(await screen.findByRole('region', { name: 'Waiting for approval' })).findByText('Kerlink');

    await userEvent.selectOptions(await within(pendingList()).findByLabelText('Assign Kerlink to an account'), 'u2');

    await waitFor(() => expect(api.assignRosterOwner).toHaveBeenCalledWith('c-Kerlink', 'u2'));
  });

  test('nothing waiting: the section is not shown', async () => {
    setup([member('Jaina')]);
    await screen.findByText('Jaina');
    expect(screen.queryByRole('region', { name: 'Waiting for approval' })).not.toBeInTheDocument();
  });
});

describe('raid leaders (approve and revoke only)', () => {
  test('see the roster and approve, but cannot edit, remove, add, assign or start a season', async () => {
    const api = setup(
      [member('Jaina', { claimed: true, username: 'jp' }), member('Free')],
      { listPendingRoster: vi.fn().mockResolvedValue([member('Kerlink', { claimed: true, username: 'cid' })]) },
      RAID_LEADER,
    );

    await screen.findByText('Jaina');
    expect(screen.getByRole('button', { name: 'Revoke Jaina' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Approve Kerlink' })).toBeInTheDocument();
    for (const name of ['Edit Jaina', 'Release Jaina', 'Remove Free']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Add to the roster' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'New season' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Assign .* to an account/)).not.toBeInTheDocument();
    expect(api.rosterAccounts).not.toHaveBeenCalled();
  });
});

describe('new season', () => {
  test('needs NEW SEASON typed, then empties the roster and says what happened', async () => {
    const api = setup([member('Jaina')], { newSeason: vi.fn().mockResolvedValue({ deleted: 1, removed: 4 }) });
    await screen.findByText('Jaina');
    const season = screen.getByRole('region', { name: 'New season' });

    await userEvent.click(within(season).getByRole('button', { name: 'Start a new season…' }));
    const go = within(season).getByRole('button', { name: 'Empty the roster' });
    expect(go).toBeDisabled();
    await userEvent.type(within(season).getByLabelText(/Type NEW SEASON/), 'new season');
    expect(go).toBeDisabled();
    await userEvent.clear(within(season).getByLabelText(/Type NEW SEASON/));
    await userEvent.type(within(season).getByLabelText(/Type NEW SEASON/), 'NEW SEASON');
    await userEvent.click(go);

    await waitFor(() => expect(api.newSeason).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/New season started: 4 characters left the roster/)).toBeInTheDocument();
  });
});
