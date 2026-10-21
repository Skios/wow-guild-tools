import { afterEach, describe, expect, test, vi } from 'vitest';
import { parseEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  TELEGRAM_BOT_TOKEN: '123:abc',
  TELEGRAM_CHANNEL_ID: '-1001',
  TELEGRAM_WEBHOOK_SECRET: 'a_long_random_secret_1234',
  SUPABASE_URL: 'https://abcdefgh.supabase.co',
};

describe('parseEnv', () => {
  test('returns typed config and defaults the port', () => {
    expect(parseEnv(valid).PORT).toBe(3000);
  });

  test('reads PORT as a number', () => {
    expect(parseEnv({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  test.each(['DATABASE_URL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHANNEL_ID', 'TELEGRAM_WEBHOOK_SECRET'])(
    'fails fast when %s is missing',
    (key) => {
      const { [key]: _removed, ...rest } = valid as Record<string, string>;
      expect(() => parseEnv(rest)).toThrow(key);
    },
  );

  test('listens on all interfaces unless HOST says otherwise (every officer route needs a login)', () => {
    expect(parseEnv(valid).HOST).toBe('0.0.0.0');
    expect(parseEnv({ ...valid, HOST: '127.0.0.1' }).HOST).toBe('127.0.0.1');
  });

  test('has no API key any more', () => {
    expect(parseEnv({ ...valid, API_KEY: 'a_long_random_api_key_1234' })).not.toHaveProperty('API_KEY');
  });

  test.each([
    'https://abcdefgh.supabase.co',
    'https://abcdefgh.supabase.co/',
    'http://127.0.0.1:54321',
    'http://localhost:54321',
  ])('accepts SUPABASE_URL %s', (url) => {
    expect(parseEnv({ ...valid, SUPABASE_URL: url }).SUPABASE_URL).toBe(url);
  });

  test.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a URL', 'abcdefgh.supabase.co'],
    ['plain http to a remote host', 'http://abcdefgh.supabase.co'],
    ['another scheme', 'ftp://abcdefgh.supabase.co'],
    ['javascript', 'javascript:alert(1)'],
  ])('refuses a SUPABASE_URL that is %s', (_, url) => {
    expect(() => parseEnv({ ...valid, SUPABASE_URL: url })).toThrow('SUPABASE_URL');
  });

  test('trusts proxy headers only when told to, with an explicit true/false', () => {
    expect(parseEnv(valid).TRUST_PROXY).toBeUndefined();
    expect(parseEnv({ ...valid, TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true);
    expect(parseEnv({ ...valid, TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(false);
    expect(() => parseEnv({ ...valid, TRUST_PROXY: 'yes' })).toThrow('TRUST_PROXY');
  });

  test('rejects a webhook secret Telegram would refuse', () => {
    expect(() => parseEnv({ ...valid, TELEGRAM_WEBHOOK_SECRET: 'short' })).toThrow('TELEGRAM_WEBHOOK_SECRET');
    expect(() => parseEnv({ ...valid, TELEGRAM_WEBHOOK_SECRET: 'has spaces and symbols!!!' })).toThrow('TELEGRAM_WEBHOOK_SECRET');
  });
});

describe('getEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test('validates process.env once and reuses the result', async () => {
    for (const [key, value] of Object.entries(valid)) vi.stubEnv(key, value);
    const { getEnv } = await import('./env.js');

    const first = getEnv();
    vi.stubEnv('PORT', '9999');

    expect(getEnv()).toBe(first);
    expect(first.PORT).toBe(3000);
  });

  test('throws a readable error naming the offending keys, without echoing their values', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'short secret with spaces');
    const { getEnv } = await import('./env.js');

    let message = '';
    try { getEnv(); } catch (error) { message = (error as Error).message; }

    expect(message).toContain('TELEGRAM_WEBHOOK_SECRET');
    expect(message).not.toContain('short secret with spaces');
  });
});
