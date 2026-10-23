import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { AuthContext } from '../context';
import { fakeAuth } from '../test/auth';
import { fakeApi, renderWith } from '../test/render';
import type { MyCharacter, Profile } from '../types';
import { ProfileView } from './ProfileView';

const character = (over: Partial<MyCharacter> = {}): MyCharacter => ({
  id: 'c1', name: 'Ulfgaar', realm: "Pozzo dell'Eternità", class: 'WARRIOR', spec: 'PROTECTION', role: 'TANK',
  offSpecs: ['FURY'], isMain: true, inRoster: true, ...over,
});
const PROFILE: Profile = {
  username: 'mrcid', nickname: 'Matte', role: 'Owner', preferredChannel: 'telegram', channels: { telegram: true },
  characters: [character(), character({ id: 'c2', name: 'Jaina', class: 'MAGE', spec: 'FIRE', role: 'RANGED_DPS', offSpecs: [], isMain: false, inRoster: false })],
};

function setup(over: Parameters<typeof fakeApi>[0] = {}) {
  const api = fakeApi({ profile: vi.fn().mockResolvedValue(PROFILE), ...over });
  renderWith(<AuthContext.Provider value={fakeAuth()}><ProfileView /></AuthContext.Provider>, api);
  return api;
}
const row = async (name: string) => (await screen.findByText(name)).closest('li')!;

describe('ProfileView: summary', () => {
  test('shows the account, its role and nickname; the nickname can be changed', async () => {
    const api = setup();
    expect(await screen.findByRole('heading', { name: 'mrcid' })).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();

    const nickname = screen.getByLabelText('Nickname');
    expect(nickname).toHaveValue('Matte');
    await userEvent.clear(nickname);
    await userEvent.type(nickname, 'Matteo');
    await userEvent.click(screen.getByRole('button', { name: 'Save nickname' }));

    expect(api.setNickname).toHaveBeenCalledWith('Matteo');
  });
});

describe('ProfileView: characters', () => {
  test('lists my characters: main first, approval status, specs', async () => {
    setup();
    const ulf = await row('Ulfgaar');
    expect(within(ulf).getByText('Main')).toBeInTheDocument();
    const jaina = await row('Jaina');
    expect(within(jaina).getByText('Waiting for an officer')).toBeInTheDocument();
  });

  test('makes another character the main', async () => {
    const api = setup();
    await userEvent.click(within(await row('Jaina')).getByRole('button', { name: 'Make main' }));
    expect(api.setMainCharacter).toHaveBeenCalledWith('c2');
    expect(api.profile).toHaveBeenCalledTimes(2);
  });

  test('removing asks first', async () => {
    const api = setup();
    const jaina = await row('Jaina');
    await userEvent.click(within(jaina).getByRole('button', { name: 'Remove' }));
    expect(api.removeMyCharacter).not.toHaveBeenCalled();
    await userEvent.click(within(jaina).getByRole('button', { name: 'Confirm remove' }));
    expect(api.removeMyCharacter).toHaveBeenCalledWith('c2');
  });

  test('edits the specs of a character (name, realm and class stay)', async () => {
    const api = setup();
    await userEvent.click(within(await row('Ulfgaar')).getByRole('button', { name: 'Edit specs' }));
    expect(screen.getByLabelText('Character')).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Specialization'), 'FURY');
    await userEvent.click(screen.getByRole('button', { name: 'Save specs' }));
    expect(api.updateMyCharacter).toHaveBeenCalledWith('c1', { spec: 'FURY', offSpecs: [] });
  });

  test('claims a free roster name', async () => {
    const api = setup({ claimable: vi.fn().mockResolvedValue([{ id: 'c9', name: 'Thrall', realm: 'Nemesis', class: 'MAGE', spec: 'FROST' }]) });
    const free = (await screen.findByText('Thrall')).closest('li')!;
    await userEvent.click(within(free).getByRole('button', { name: "It's mine" }));
    expect(api.claimCharacter).toHaveBeenCalledWith('c9');
  });

  test('adds a character picked from the suggestions', async () => {
    const searchCharacters = vi.fn().mockResolvedValue([{ name: 'Brannock', realm: 'Nemesis', class: 'WARRIOR', inGuild: true }]);
    const api = setup({ searchCharacters });
    await userEvent.click(await screen.findByRole('button', { name: 'Add a character' }));

    await userEvent.type(screen.getByLabelText('Character'), 'bra');
    await userEvent.click(await screen.findByRole('button', { name: /Brannock/ }));
    expect(screen.getByLabelText('Realm')).toHaveValue('Nemesis');
    await userEvent.selectOptions(screen.getByLabelText('Specialization'), 'PROTECTION');
    await userEvent.click(screen.getByRole('button', { name: 'Add character' }));

    expect(searchCharacters).toHaveBeenCalledWith('bra');
    expect(api.addMyCharacter).toHaveBeenCalledWith(expect.objectContaining({ name: 'Brannock', realm: 'Nemesis', class: 'WARRIOR', spec: 'PROTECTION' }));
  });
});

describe('ProfileView: channels and password', () => {
  test('Telegram is the preferred channel', async () => {
    setup();
    expect(await screen.findByText(/Preferred channel: Telegram/)).toBeInTheDocument();
  });

  test('the password form opens in a dialog, with a reset link on Telegram as an option', async () => {
    const api = setup();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();

    await userEvent.click(await screen.findByRole('button', { name: 'Change password' }));
    const dialog = screen.getByRole('dialog', { name: 'Change password' });
    expect(within(dialog).getByLabelText('New password')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Send me a reset link on Telegram' }));
    expect(api.sendResetLink).toHaveBeenCalled();
    expect(await within(dialog).findByText(/sent to your Telegram/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('without Telegram the reset link is not offered', async () => {
    setup({ profile: vi.fn().mockResolvedValue({ ...PROFILE, channels: { telegram: false } }) });
    await userEvent.click(await screen.findByRole('button', { name: 'Change password' }));
    expect(screen.queryByRole('button', { name: 'Send me a reset link on Telegram' })).not.toBeInTheDocument();
  });
});
