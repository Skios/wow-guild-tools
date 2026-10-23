import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ApiError } from '../api';
import { OFFICER, fakeApi, renderWith } from '../test/render';
import type { SiteRoleSummary } from '../types';
import { RolesView } from './RolesView';

const role = (name: string, position: number, over: Partial<SiteRoleSummary> = {}): SiteRoleSummary => ({
  id: `r-${name}`, name, position, capabilities: [], isOwner: false, isDefault: false, users: 0, ...over,
});
const ROLES = [
  role('Raider', 40, { isDefault: true, users: 12 }),
  role('Owner', 0, { isOwner: true, users: 1 }),
  role('Officer', 20, { capabilities: ['roster.manage', 'events.manage'], users: 3 }),
];
const CAPABILITIES = ['accounts.manage', 'events.manage', 'messages.send', 'roster.approve', 'roster.manage'];

const setup = (over = {}) => {
  const api = fakeApi({ listRoles: vi.fn().mockResolvedValue(ROLES), roleCapabilities: vi.fn().mockResolvedValue(CAPABILITIES), ...over });
  renderWith(<RolesView />, api, undefined, { ...OFFICER, isOwner: true, role: 'Owner' });
  return api;
};
const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr')!;

describe('the roles list', () => {
  test('ordered by rank, with capabilities, accounts and the default role', async () => {
    setup();
    await screen.findByText('Officer');

    const names = screen.getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell')[0]!.textContent);
    expect(names).toEqual(['Owner', 'Officer', 'Raider']);
    expect(within(await rowOf('Officer')).getByText('Edit the roster')).toBeInTheDocument();
    expect(within(await rowOf('Officer')).getByText('3')).toBeInTheDocument();
    expect(within(await rowOf('Raider')).getByText('Default')).toBeInTheDocument();
    expect(within(await rowOf('Owner')).getByText('Everything')).toBeInTheDocument();
  });

  test('the Owner role cannot be edited or deleted', async () => {
    setup();
    const owner = await rowOf('Owner');
    expect(within(owner).queryByRole('button')).not.toBeInTheDocument();
  });

  test('a failure to load is shown', async () => {
    setup({ listRoles: vi.fn().mockRejectedValue(new ApiError('Owner only', 403)) });
    expect(await screen.findByRole('alert')).toHaveTextContent('Owner only');
  });
});

describe('creating a role', () => {
  test('name, rank and capabilities picked from the list the code registers', async () => {
    const api = setup();
    await screen.findByText('Officer');
    await userEvent.click(screen.getByRole('button', { name: 'New role' }));
    const form = screen.getByRole('form', { name: 'New role' });

    await userEvent.type(within(form).getByLabelText('Name'), 'Raid assist');
    await userEvent.clear(within(form).getByLabelText(/Rank/));
    await userEvent.type(within(form).getByLabelText(/Rank/), '35');
    expect(within(form).getAllByRole('checkbox')).toHaveLength(CAPABILITIES.length);
    await userEvent.click(within(form).getByRole('checkbox', { name: 'Approve characters for the roster' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Create role' }));

    await waitFor(() => expect(api.createRole).toHaveBeenCalledWith({ name: 'Raid assist', position: 35, capabilities: ['roster.approve'] }));
    expect(await screen.findByText('Raid assist created.')).toBeInTheDocument();
    expect(api.listRoles).toHaveBeenCalledTimes(2);
  });

  test('shows the server refusal and keeps the form', async () => {
    setup({ createRole: vi.fn().mockRejectedValue(new ApiError('A role with that name exists', 409)) });
    await screen.findByText('Officer');
    await userEvent.click(screen.getByRole('button', { name: 'New role' }));
    const form = screen.getByRole('form', { name: 'New role' });
    await userEvent.type(within(form).getByLabelText('Name'), 'Officer');
    await userEvent.click(within(form).getByRole('button', { name: 'Create role' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent('A role with that name exists');
  });

  test('rank must be 1 or more (0 is the Owner) and the name 2 characters; nothing is sent', async () => {
    const api = setup();
    await screen.findByText('Officer');
    await userEvent.click(screen.getByRole('button', { name: 'New role' }));
    const form = screen.getByRole('form', { name: 'New role' });
    await userEvent.type(within(form).getByLabelText('Name'), 'X');
    await userEvent.clear(within(form).getByLabelText(/Rank/));
    await userEvent.type(within(form).getByLabelText(/Rank/), '0');
    await userEvent.click(within(form).getByRole('button', { name: 'Create role' }));

    expect(within(form).getByText(/2-32 characters/)).toBeInTheDocument();
    expect(within(form).getByText(/1 or more/)).toBeInTheDocument();
    expect(api.createRole).not.toHaveBeenCalled();
  });
});

describe('editing and deleting', () => {
  test('edit starts from the current values and saves', async () => {
    const api = setup();
    await userEvent.click(within(await rowOf('Officer')).getByRole('button', { name: 'Edit Officer' }));
    const form = screen.getByRole('form', { name: 'Edit Officer' });
    expect(within(form).getByLabelText('Name')).toHaveValue('Officer');
    expect(within(form).getByRole('checkbox', { name: 'Edit the roster' })).toBeChecked();

    await userEvent.click(within(form).getByRole('checkbox', { name: 'Create and manage events' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Save role' }));

    await waitFor(() => expect(api.updateRole).toHaveBeenCalledWith('r-Officer', { name: 'Officer', position: 20, capabilities: ['roster.manage'] }));
  });

  test('a capability the code no longer has is not offered back', async () => {
    setup({ listRoles: vi.fn().mockResolvedValue([role('Old', 30, { capabilities: ['gone.away', 'events.manage'] })]) });
    await userEvent.click(within(await rowOf('Old')).getByRole('button', { name: 'Edit Old' }));
    expect(screen.queryByRole('checkbox', { name: /gone\.away/ })).not.toBeInTheDocument();
  });

  test('a role with accounts cannot be deleted until they get another one', async () => {
    setup();
    const remove = within(await rowOf('Officer')).getByRole('button', { name: 'Delete Officer' });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAttribute('title', 'Give its 3 accounts another role first');
  });

  test('delete asks first, then deletes; a server refusal is shown', async () => {
    const empty = role('Spare', 30);
    const api = setup({ listRoles: vi.fn().mockResolvedValue([...ROLES, empty]) });
    await userEvent.click(within(await rowOf('Spare')).getByRole('button', { name: 'Delete Spare' }));
    expect(api.deleteRole).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('group', { name: 'Confirm deleting Spare' })).getByRole('button', { name: 'Yes' }));

    await waitFor(() => expect(api.deleteRole).toHaveBeenCalledWith('r-Spare'));
    expect(await screen.findByText('Spare deleted.')).toBeInTheDocument();

    vi.mocked(api.deleteRole).mockRejectedValueOnce(new ApiError('Still in use', 409));
    await userEvent.click(within(await rowOf('Spare')).getByRole('button', { name: 'Delete Spare' }));
    await userEvent.click(within(screen.getByRole('group', { name: 'Confirm deleting Spare' })).getByRole('button', { name: 'Yes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Still in use');
  });

  test('a later success clears an earlier error', async () => {
    setup({ listRoles: vi.fn().mockResolvedValue([...ROLES, role('Spare', 30)]), deleteRole: vi.fn().mockRejectedValue(new ApiError('Still in use', 409)) });
    await userEvent.click(within(await rowOf('Spare')).getByRole('button', { name: 'Delete Spare' }));
    await userEvent.click(within(screen.getByRole('group', { name: 'Confirm deleting Spare' })).getByRole('button', { name: 'Yes' }));
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: 'New role' }));
    expect(screen.queryByText('Still in use')).not.toBeInTheDocument();
  });

  test('not the Owner: no requests, a plain message', async () => {
    const api = fakeApi();
    renderWith(<RolesView />, api);
    expect(screen.getByText('Only the Owner configures roles.')).toBeInTheDocument();
    expect(api.listRoles).not.toHaveBeenCalled();
    expect(api.roleCapabilities).not.toHaveBeenCalled();
  });

  test('Edit and New wait for the capability list', async () => {
    setup({ roleCapabilities: vi.fn().mockReturnValue(new Promise(() => {})) });
    expect(within(await rowOf('Officer')).getByRole('button', { name: 'Edit Officer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New role' })).toBeDisabled();
  });

  test('the default role offers no delete (new accounts get it)', async () => {
    setup();
    expect(within(await rowOf('Raider')).queryByRole('button', { name: 'Delete Raider' })).not.toBeInTheDocument();
  });
});
