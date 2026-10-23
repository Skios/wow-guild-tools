import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import type { Account, Officer, SiteRoleSummary } from '../types';
import { OFFICER, fakeApi, renderWith } from '../test/render';
import { UsersView } from './UsersView';

const role = (id: string, name: string, position: number, over: Partial<SiteRoleSummary> = {}): SiteRoleSummary =>
  ({ id, name, position, capabilities: [], isOwner: false, isDefault: false, users: 0, ...over });
const ROLES = [
  role('r0', 'Owner', 0, { isOwner: true }),
  role('r1', 'Guildmaster', 10, { capabilities: ['accounts.manage'] }),
  role('r2', 'Officer', 20, { capabilities: ['accounts.manage', 'events.manage'] }),
  role('r3', 'Treasurer', 30, { capabilities: ['billing.manage'] }),
  role('r4', 'Raider', 40, { isDefault: true }),
];
const account = (id: string, username: string, r: SiteRoleSummary | null, over: Partial<Account> = {}): Account => ({
  id, username, mustChangePassword: false, role: r && { id: r.id, name: r.name, position: r.position, isOwner: r.isOwner },
  characters: [], ...over,
});
const ACCOUNTS = [
  account('u0', 'gm', ROLES[0]!),
  account('u1', 'cid', ROLES[2]!),
  account('u2', 'peer', ROLES[2]!),
  account('u5', 'newbie', ROLES[4]!, { characters: [{ name: 'Thrall', realm: 'Nemesis', class: 'SHAMAN' }] }),
];

function setup(over: Partial<Parameters<typeof fakeApi>[0]> = {}, me: Officer = OFFICER) {
  const api = fakeApi({ listUsers: vi.fn().mockResolvedValue(ACCOUNTS), listRoles: vi.fn().mockResolvedValue(ROLES), ...over });
  renderWith(<UsersView me={me} />, api);
  return api;
}
const row = async (name: string) => (await screen.findByRole('cell', { name })).closest('tr')!;

describe('UsersView', () => {
  test('lists accounts with role and characters', async () => {
    setup();
    const newbie = await row('newbie');
    expect(within(newbie).getByText('Thrall')).toBeInTheDocument();
    expect(within(newbie).getByRole('combobox', { name: 'Role of newbie' })).toHaveValue('r4');
  });

  test('offers only roles equal or below yours whose capabilities you have', async () => {
    setup();
    const picker = within(await row('newbie')).getByRole('combobox', { name: 'Role of newbie' });
    const options = within(picker).getAllByRole('option').map(o => o.textContent);
    expect(options).toEqual(['Officer', 'Raider']);
  });

  test("a role you can't give still shows as the current one, not selectable", async () => {
    setup({ listUsers: vi.fn().mockResolvedValue([account('u6', 'banker', ROLES[3]!)]) });
    const picker = within(await row('banker')).getByRole('combobox');
    expect(picker).toHaveValue('r3');
    expect(within(picker).getByRole('option', { name: 'Treasurer' })).toBeDisabled();
  });

  test('people at your level or above, and yourself, are read-only', async () => {
    setup();
    for (const name of ['gm', 'cid', 'peer']) {
      const r = await row(name);
      expect(within(r).queryByRole('combobox')).not.toBeInTheDocument();
      expect(within(r).queryByRole('button', { name: /reset/i })).not.toBeInTheDocument();
    }
  });

  test('changing the role saves it and reloads the list', async () => {
    const api = setup();
    await userEvent.selectOptions(within(await row('newbie')).getByRole('combobox'), 'r2');

    expect(api.setUserRole).toHaveBeenCalledWith('u5', 'r2');
    expect(api.listUsers).toHaveBeenCalledTimes(2);
  });

  test('a refused change shows the reason', async () => {
    setup({ setUserRole: vi.fn().mockRejectedValue(new Error('You can only give a role whose capabilities you have')) });
    await userEvent.selectOptions(within(await row('newbie')).getByRole('combobox'), 'r2');
    expect(await screen.findByRole('alert')).toHaveTextContent('whose capabilities you have');
  });

  test('reset asks for confirmation, then shows the temporary password once', async () => {
    const api = setup();
    const r = await row('newbie');
    await userEvent.click(within(r).getByRole('button', { name: 'Reset password' }));
    expect(api.resetUserPassword).not.toHaveBeenCalled();

    await userEvent.click(within(r).getByRole('button', { name: 'Confirm reset' }));

    expect(api.resetUserPassword).toHaveBeenCalledWith('u5');
    const shown = await screen.findByRole('status');
    expect(shown).toHaveTextContent('Temp-password-123');
    expect(shown).toHaveTextContent(/newbie.*shown only once/i);
  });

  test('the Owner can manage everyone else and give any role', async () => {
    setup({}, { ...OFFICER, userId: 'u0', username: 'gm', role: 'Owner', position: 0, isOwner: true });
    const peer = await row('peer');
    const options = within(within(peer).getByRole('combobox')).getAllByRole('option').map(o => o.textContent);
    expect(options).toEqual(['Owner', 'Guildmaster', 'Officer', 'Treasurer', 'Raider']);
    expect(within(await row('gm')).queryByRole('combobox')).not.toBeInTheDocument();
  });

  test('a load failure can be retried', async () => {
    const listUsers = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(ACCOUNTS);
    setup({ listUsers });
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await row('newbie')).toBeInTheDocument();
  });
});
