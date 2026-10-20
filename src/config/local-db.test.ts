import { describe, expect, test } from 'vitest';
import { assertLocalDatabase } from './local-db.js';

describe('assertLocalDatabase', () => {
  test.each([
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    'postgresql://wgt:pw@localhost:5433/wow_guild_tools',
    'postgresql://wgt:pw@[::1]:5432/db',
  ])('allows %s', (url) => {
    expect(() => assertLocalDatabase(url, false)).not.toThrow();
  });

  test.each([
    'postgresql://postgres.ref:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
    'postgresql://postgres:pw@db.ref.supabase.co:5432/postgres',
    'postgresql://u:p@localhost.evil.example:5432/db',
    'postgresql://u:p@10.0.0.5:5432/db',
  ])('refuses %s', (url) => {
    expect(() => assertLocalDatabase(url, false)).toThrow(/Refusing/);
  });

  test.each([undefined, '', 'not a url'])('refuses a missing or broken URL (%j)', (url) => {
    expect(() => assertLocalDatabase(url, false)).toThrow(/DATABASE_URL/);
  });

  test('an explicit opt-in allows a remote database', () => {
    expect(() => assertLocalDatabase('postgresql://u:p@db.ref.supabase.co/postgres', true)).not.toThrow();
  });

  test('reads the opt-in from ALLOW_SEED by default', () => {
    const before = process.env.ALLOW_SEED;
    process.env.ALLOW_SEED = '1';
    try {
      expect(() => assertLocalDatabase('postgresql://u:p@db.ref.supabase.co/postgres')).not.toThrow();
    } finally {
      if (before === undefined) delete process.env.ALLOW_SEED; else process.env.ALLOW_SEED = before;
    }
  });
});
