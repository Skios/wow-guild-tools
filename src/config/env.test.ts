import { describe, expect, test } from 'vitest';
import { parseEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  TELEGRAM_BOT_TOKEN: '123:abc',
  TELEGRAM_CHANNEL_ID: '-1001',
  TELEGRAM_WEBHOOK_SECRET: 'a_long_random_secret_1234',
  API_KEY: 'a_long_random_api_key_1234',
};

describe('parseEnv', () => {
  test('returns typed config and defaults the port', () => {
    expect(parseEnv(valid).PORT).toBe(3000);
  });

  test('reads PORT as a number', () => {
    expect(parseEnv({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  test.each(['DATABASE_URL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHANNEL_ID', 'TELEGRAM_WEBHOOK_SECRET', 'API_KEY'])(
    'fails fast when %s is missing',
    (key) => {
      const { [key]: _removed, ...rest } = valid as Record<string, string>;
      expect(() => parseEnv(rest)).toThrow(key);
    },
  );

  test('rejects a webhook secret Telegram would refuse', () => {
    expect(() => parseEnv({ ...valid, TELEGRAM_WEBHOOK_SECRET: 'short' })).toThrow('TELEGRAM_WEBHOOK_SECRET');
    expect(() => parseEnv({ ...valid, TELEGRAM_WEBHOOK_SECRET: 'has spaces and symbols!!!' })).toThrow('TELEGRAM_WEBHOOK_SECRET');
  });
});
