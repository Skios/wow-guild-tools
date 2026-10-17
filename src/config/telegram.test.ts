import { describe, expect, test, vi } from 'vitest';

vi.mock('./env.js', () => ({
  getEnv: () => ({ TELEGRAM_BOT_TOKEN: 'tok', TELEGRAM_CHANNEL_ID: '-100', TELEGRAM_WEBHOOK_SECRET: 'sec' }),
}));

import { telegramConfig } from './telegram.js';

describe('telegramConfig', () => {
  test('reads values from the validated environment', () => {
    expect(telegramConfig).toMatchObject({ token: 'tok', channelId: '-100', webhookSecret: 'sec' });
  });
});
