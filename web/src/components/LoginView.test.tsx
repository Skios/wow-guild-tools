import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ApiError } from '../api';
import { fakeApi, renderWith } from '../test/render';
import { LoginView } from './LoginView';

describe('LoginView', () => {
  test('cannot be submitted while the field is empty or blank', async () => {
    renderWith(<LoginView onLogin={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(button).toBeDisabled();

    await userEvent.type(screen.getByLabelText('API key'), '   ');
    expect(button).toBeDisabled();
  });

  test('checks the key, then signs in with the trimmed value', async () => {
    const api = fakeApi();
    const onLogin = vi.fn();
    renderWith(<LoginView onLogin={onLogin} />, api);

    await userEvent.type(screen.getByLabelText('API key'), '  secret  ');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('secret'));
    expect(api.checkKey).toHaveBeenCalledWith('secret');
  });

  test('a wrong key shows the error, stays on the page and lets the user retry', async () => {
    const checkKey = vi.fn().mockRejectedValueOnce(new ApiError('Invalid API key', 401)).mockResolvedValue({ ok: true });
    const onLogin = vi.fn();
    renderWith(<LoginView onLogin={onLogin} />, fakeApi({ checkKey }));

    await userEvent.type(screen.getByLabelText('API key'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid API key');
    expect(screen.getByLabelText('API key')).toHaveAttribute('aria-invalid', 'true');
    expect(onLogin).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('nope'));
  });

  test('an unreachable server is explained', async () => {
    const checkKey = vi.fn().mockRejectedValue(new ApiError('Cannot reach the server. Is the API running?', 0));
    renderWith(<LoginView onLogin={vi.fn()} />, fakeApi({ checkKey }));

    await userEvent.type(screen.getByLabelText('API key'), 'k');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/reach the server/i);
  });

  test('double clicking checks the key once', async () => {
    let resolve!: (v: { ok: true }) => void;
    const checkKey = vi.fn().mockReturnValue(new Promise(r => { resolve = r; }));
    renderWith(<LoginView onLogin={vi.fn()} />, fakeApi({ checkKey }));

    await userEvent.type(screen.getByLabelText('API key'), 'k');
    const button = screen.getByRole('button', { name: 'Sign in' });
    await userEvent.dblClick(button);

    expect(checkKey).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();
    resolve({ ok: true });
  });

  test('the key is typed into a password field', () => {
    renderWith(<LoginView onLogin={vi.fn()} />);
    expect(screen.getByLabelText('API key')).toHaveAttribute('type', 'password');
  });
});
