import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ApiError } from '../api';
import { fakeAuth } from '../test/auth';
import { currentPath, navigate } from '../test/nav';
import { Signup } from './Signup';

const setup = (signup = vi.fn().mockResolvedValue({ name: 'ulfgaar' }), auth = fakeAuth(null)) => {
  navigate('/signup');
  render(<Signup auth={auth} signup={signup} />);
  return {
    auth, signup,
    nickname: screen.getByLabelText('Nickname'),
    password: screen.getByLabelText('Password'),
    confirm: screen.getByLabelText('Repeat password'),
    submit: screen.getByRole('button', { name: 'Create account' }),
  };
};

async function fill(f: ReturnType<typeof setup>, nickname: string, password: string, confirm = password) {
  await userEvent.type(f.nickname, nickname);
  await userEvent.type(f.password, password);
  await userEvent.type(f.confirm, confirm);
  await userEvent.click(f.submit);
}

describe('Signup', () => {
  test('is a real form with the hints Chrome needs to offer saving the new password', () => {
    const { nickname, password, confirm } = setup();
    expect(nickname.closest('form')).toHaveAttribute('method', 'post');
    expect(nickname).toHaveAttribute('autocomplete', 'username');
    expect(password).toHaveAttribute('autocomplete', 'new-password');
    expect(confirm).toHaveAttribute('autocomplete', 'new-password');
    expect(password).toHaveAttribute('type', 'password');
    expect(screen.queryByText(/e-?mail/i)).not.toBeInTheDocument();
    expect(screen.getByText(/12 characters/)).toBeInTheDocument();
  });

  test('creates the account, signs in with it and opens the site', async () => {
    const f = setup();
    await fill(f, ' Ulfgaar ', 'Correct-horse1');

    expect(f.signup).toHaveBeenCalledWith('ulfgaar', 'Correct-horse1');
    expect(f.auth.mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'ulfgaar@wgt.invalid', password: 'Correct-horse1' });
    expect(currentPath()).toBe('/events');
  });

  test.each([
    ['a bad nickname', 'u f', 'Correct-horse1', 'Correct-horse1', /3 to 24 characters/],
    ['a weak password', 'ulfgaar', 'password', 'password', /12 characters/],
    ['a password with the nickname', 'ulfgaar', 'Ulfgaar-2026!x', 'Ulfgaar-2026!x', /nickname/],
    ['passwords that differ', 'ulfgaar', 'Correct-horse1', 'Correct-horse2', /do not match/],
  ])('%s is explained without calling the server', async (_label, nickname, password, confirm, reason) => {
    const f = setup();
    await fill(f, nickname, password, confirm);

    expect(screen.getByRole('alert')).toHaveTextContent(reason);
    expect(f.signup).not.toHaveBeenCalled();
  });

  test('the server refusing (e.g. nickname taken) shows its reason and keeps the form', async () => {
    const f = setup(vi.fn().mockRejectedValue(new ApiError('That nickname is already taken', 409)));
    await fill(f, 'ulfgaar', 'Correct-horse1');

    expect(await screen.findByRole('alert')).toHaveTextContent('That nickname is already taken');
    expect(f.auth.mocks.signInWithPassword).not.toHaveBeenCalled();
    expect(f.submit).toBeEnabled();
    expect(currentPath()).toBe('/signup');
  });

  test('if signing in fails right after, the account exists and the person is sent to sign in', async () => {
    const auth = fakeAuth(null);
    auth.mocks.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { status: 500, message: 'x' } } as never);
    const f = setup(undefined, auth);
    await fill(f, 'ulfgaar', 'Correct-horse1');

    expect(await screen.findByRole('alert')).toHaveTextContent(/account was created.*sign in/i);
  });

  test('links back to sign-in', () => {
    setup();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/events');
  });
});
