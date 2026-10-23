import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ApiError } from '../api';
import { fakeAuth } from '../test/auth';
import { fakeApi, renderWith } from '../test/render';
import { ChangePassword } from './ChangePassword';

function setup(forced = false, api = fakeApi()) {
  const auth = fakeAuth();
  const onDone = vi.fn();
  renderWith(<ChangePassword auth={auth} username="newbie" forced={forced} onDone={onDone} />, api);
  return { api, auth, onDone };
}
async function fill(password: string, confirm = password, current = 'Old-pass-1234') {
  await userEvent.type(screen.getByLabelText(/^(Current|Temporary) password$/), current);
  await userEvent.type(screen.getByLabelText('New password'), password);
  await userEvent.type(screen.getByLabelText('Repeat new password'), confirm);
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
}

describe('ChangePassword', () => {
  test('carries the username so Chrome updates the right saved password', () => {
    setup();
    const user = screen.getByLabelText('Nickname');
    expect(user).toHaveValue('newbie');
    expect(user).toHaveAttribute('autocomplete', 'username');
    expect(user).toHaveAttribute('readonly');
    expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Current password')).toHaveAttribute('autocomplete', 'current-password');
    expect(user.closest('form')).toHaveAttribute('method', 'post');
  });

  test('after a reset it explains why, and asks for the temporary password as the current one', () => {
    setup(true);
    expect(screen.getByText(/signed in with a temporary password/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Temporary password')).toBeInTheDocument();
  });

  test('changes the password, signs in again with it and reports done', async () => {
    const { api, auth, onDone } = setup();
    await fill('Correct-horse1');

    expect(api.changePassword).toHaveBeenCalledWith('Old-pass-1234', 'Correct-horse1');
    expect(auth.mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'newbie@wgt.invalid', password: 'Correct-horse1' });
    expect(onDone).toHaveBeenCalled();
  });

  test.each([
    ['too short', 'short', 'short', /12 characters/],
    ['containing the nickname', 'Newbie-2026!xx', 'Newbie-2026!xx', /nickname/],
    ['not repeated the same', 'Correct-horse1', 'Correct-horse2', /do not match/],
    ['equal to the current one', 'Old-pass-1234', 'Old-pass-1234', /different/],
  ])('a password %s is explained without calling the server', async (_label, password, confirm, reason) => {
    const { api } = setup();
    await fill(password, confirm);
    expect(screen.getByRole('alert')).toHaveTextContent(reason);
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  test('a server refusal shows its reason', async () => {
    const { onDone } = setup(false, fakeApi({ changePassword: vi.fn().mockRejectedValue(new ApiError('Password refused as too weak by the sign-in service', 400)) }));
    await fill('Correct-horse1');
    expect(await screen.findByRole('alert')).toHaveTextContent('too weak');
    expect(onDone).not.toHaveBeenCalled();
  });
});
