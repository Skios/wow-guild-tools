import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from '../api';
import { fakeApi, renderWith } from '../test/render';
import { TelegramCard } from './TelegramCard';

const setup = (over = {}) => {
  const api = fakeApi(over);
  renderWith(<TelegramCard username="cid" />, api);
  return api;
};
afterEach(() => vi.unstubAllGlobals());

describe('TelegramCard', () => {
  test('not linked: "Link Telegram" makes a fresh bot link on click and opens it', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const api = setup();

    await userEvent.click(await screen.findByRole('button', { name: 'Link Telegram' }));

    expect(api.telegramBotLink).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('https://t.me/guild_bot?start=lTOKEN');
  });

  test('linked: says so and can unlink', async () => {
    const telegramStatus = vi.fn().mockResolvedValueOnce({ linked: true }).mockResolvedValue({ linked: false });
    const api = setup({ telegramStatus });

    expect(await screen.findByText('Telegram is linked to your account.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Unlink' }));

    expect(api.unlinkTelegram).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Link Telegram' })).toBeInTheDocument();
  });

  test('a waiting bot link is linked only after confirming, then the status refreshes', async () => {
    sessionStorage.setItem('wgt-telegram-link', 'BOTTOKEN');
    const telegramStatus = vi.fn().mockResolvedValueOnce({ linked: false }).mockResolvedValue({ linked: true });
    const api = setup({ telegramStatus });

    expect(await screen.findByText(/only if you sent \/start to the bot yourself/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Link it' }));

    expect(api.linkTelegram).toHaveBeenCalledWith('BOTTOKEN');
    expect(await screen.findByText('Telegram is linked to your account.')).toBeInTheDocument();
    expect(sessionStorage.getItem('wgt-telegram-link')).toBeNull();
  });

  test('discarding a waiting link forgets it', async () => {
    sessionStorage.setItem('wgt-telegram-link', 'BOTTOKEN');
    const api = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(api.linkTelegram).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('wgt-telegram-link')).toBeNull();
  });

  test('a refused link shows why (e.g. unlink first) and is dropped', async () => {
    sessionStorage.setItem('wgt-telegram-link', 'BOTTOKEN');
    setup({ linkTelegram: vi.fn().mockRejectedValue(new ApiError('Your account already has a Telegram linked: unlink it on your account page first.', 409)) });
    await userEvent.click(await screen.findByRole('button', { name: 'Link it' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/unlink/);
    expect(sessionStorage.getItem('wgt-telegram-link')).toBeNull();
  });

  test('when no bot link can be made, says so', async () => {
    setup({ telegramBotLink: vi.fn().mockRejectedValue(new ApiError('Linking is not available right now', 503)) });
    await userEvent.click(await screen.findByRole('button', { name: 'Link Telegram' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not available');
  });
});
