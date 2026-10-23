import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from '../api';
import { ResetPassword } from './ResetPassword';

afterEach(() => window.history.replaceState({}, '', '/'));
const open = (reset = vi.fn().mockResolvedValue(undefined), url = '/reset?t=RESETTOKEN') => {
  window.history.replaceState({}, '', url);
  render(<ResetPassword reset={reset} />);
  return reset;
};
async function fill(password: string, confirm = password) {
  await userEvent.type(screen.getByLabelText('New password'), password);
  await userEvent.type(screen.getByLabelText('Repeat new password'), confirm);
  await userEvent.click(screen.getByRole('button', { name: 'Set new password' }));
}

describe('ResetPassword (the link from the bot)', () => {
  test('sets the new password with the token from the link, then points to sign-in', async () => {
    const reset = open();
    expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByRole('list', { name: 'Password rules' })).toBeInTheDocument();

    await fill('Correct-horse1');

    expect(reset).toHaveBeenCalledWith('RESETTOKEN', 'Correct-horse1');
    expect(await screen.findByText(/Password changed/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/events');
  });

  test('weak or mismatched passwords are explained without calling the server', async () => {
    const reset = open();
    await fill('short');
    expect(screen.getByRole('alert')).toHaveTextContent(/12 characters/);
    await userEvent.clear(screen.getByLabelText('New password'));
    await userEvent.clear(screen.getByLabelText('Repeat new password'));
    await fill('Correct-horse1', 'Correct-horse2');
    expect(screen.getByRole('alert')).toHaveTextContent(/do not match/);
    expect(reset).not.toHaveBeenCalled();
  });

  test('an expired link says to ask the bot again', async () => {
    open(vi.fn().mockRejectedValue(new ApiError('This reset link has expired: ask for a new one (send /reset to the bot).', 400)));
    await fill('Correct-horse1');
    expect(await screen.findByRole('alert')).toHaveTextContent(/send \/reset/);
  });

  test('a link without a token says so', () => {
    open(undefined, '/reset');
    expect(screen.getByRole('alert')).toHaveTextContent(/incomplete/);
  });
});
