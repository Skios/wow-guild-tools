import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { Login } from './Login';
import { fakeAuth } from '../test/auth';

const setup = (auth = fakeAuth(null)) => {
  render(<Login auth={auth} />);
  return {
    auth,
    nickname: screen.getByLabelText('Nickname'),
    password: screen.getByLabelText('Password'),
    submit: screen.getByRole('button', { name: 'Sign in' }),
  };
};

describe('Login', () => {
  test('has a nickname and a masked password with the right autocomplete hints, and never asks for an email', () => {
    const { nickname, password } = setup();
    expect(nickname).toHaveAttribute('autocomplete', 'username');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.queryByText(/e-?mail/i)).not.toBeInTheDocument();
  });

  test('signs in with the hidden address of the trimmed, lower-cased nickname', async () => {
    const { auth, nickname, password } = setup();
    await userEvent.type(nickname, '  CiD ');
    await userEvent.type(password, 'S3cret pass{enter}');

    expect(auth.mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'cid@wgt.invalid', password: 'S3cret pass' });
  });

  test('empty fields explain what is missing and do not call the server', async () => {
    const { auth, submit, nickname } = setup();
    await userEvent.click(submit);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your nickname and password.');

    await userEvent.type(nickname, 'cid');
    await userEvent.click(submit);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your nickname and password.');
    expect(auth.mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  test('a nickname in the wrong format is explained without calling the server', async () => {
    const { auth, nickname, password, submit } = setup();
    await userEvent.type(nickname, 'a@b.com');
    await userEvent.type(password, 'x');
    await userEvent.click(submit);

    expect(screen.getByRole('alert')).toHaveTextContent(/3 to 24 characters/);
    expect(nickname).toHaveAttribute('aria-invalid', 'true');
    expect(auth.mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  test('wrong credentials show a message that does not say which part was wrong, and re-enable the form', async () => {
    const auth = fakeAuth(null);
    auth.mocks.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: { status: 400, message: 'Invalid login credentials' } } as never);
    const { nickname, password, submit } = setup(auth);
    await userEvent.type(nickname, 'cid');
    await userEvent.type(password, 'nope');
    await userEvent.click(submit);

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong nickname or password.');
    expect(screen.getByRole('alert').textContent).not.toMatch(/wgt|invalid login/i);
    expect(submit).toBeEnabled();
    expect(password).toHaveValue('nope');
  });

  test.each([
    ['an auth error without a status (network down)', { status: 0, message: 'fetch failed' }],
    ['a rate limit', { status: 429, message: 'too many' }],
  ])('%s says to try again', async (_name, error) => {
    const auth = fakeAuth(null);
    auth.mocks.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error } as never);
    const { nickname, password, submit } = setup(auth);
    await userEvent.type(nickname, 'cid');
    await userEvent.type(password, 'pw');
    await userEvent.click(submit);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the sign-in service. Try again in a moment.');
  });

  test('a thrown network failure is handled the same way', async () => {
    const auth = fakeAuth(null);
    auth.mocks.signInWithPassword.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { nickname, password, submit } = setup(auth);
    await userEvent.type(nickname, 'cid');
    await userEvent.type(password, 'pw');
    await userEvent.click(submit);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the sign-in service.');
    expect(submit).toBeEnabled();
  });

  test('is disabled while signing in, so a double submit sends one request', async () => {
    const auth = fakeAuth(null);
    let finish!: (v: unknown) => void;
    auth.mocks.signInWithPassword.mockReturnValueOnce(new Promise(r => { finish = r; }) as never);
    const { nickname, password, submit } = setup(auth);
    await userEvent.type(nickname, 'cid');
    await userEvent.type(password, 'pw');

    await userEvent.click(submit);
    await userEvent.click(submit);
    await userEvent.type(password, '{enter}');

    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent('Signing in…');
    expect(nickname).toBeDisabled();
    expect(auth.mocks.signInWithPassword).toHaveBeenCalledTimes(1);
    finish({ data: {}, error: { status: 400, message: 'x' } });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  test('a new attempt clears the previous error', async () => {
    const auth = fakeAuth(null);
    auth.mocks.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { status: 400, message: 'x' } } as never);
    const { nickname, password, submit } = setup(auth);
    await userEvent.type(nickname, 'cid');
    await userEvent.type(password, 'pw');
    await userEvent.click(submit);
    await screen.findByRole('alert');

    await userEvent.click(submit);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
