import { describe, expect, test } from 'vitest';
import { linkKey, signLinkToken, verifyLinkToken } from './link-token.js';

const KEY = linkKey('sb_secret_test');
const NOW = 1_800_000_000_000;
const ACCOUNT = '3f2b8c1e-8a4d-4c55-9d7e-000000000001';

describe('link tokens', () => {
  test('an account token round-trips and fits a Telegram start parameter (64 chars, A-Z a-z 0-9 _ -)', () => {
    const token = signLinkToken({ kind: 'account', id: ACCOUNT }, KEY, NOW);
    expect(`l${token}`.length).toBeLessThanOrEqual(64);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verifyLinkToken(token, KEY, NOW + 60_000)).toMatchObject({ kind: 'account', id: ACCOUNT });
  });

  test('a reset token carries the account id and is not an account (linking) token', () => {
    const token = signLinkToken({ kind: 'reset', id: ACCOUNT }, KEY, NOW);
    expect(verifyLinkToken(token, KEY, NOW)).toMatchObject({ kind: 'reset', id: ACCOUNT });
  });

  test('says when the token was made (to refuse a reset link made before the last password change)', () => {
    const token = signLinkToken({ kind: 'reset', id: ACCOUNT }, KEY, NOW);
    expect(verifyLinkToken(token, KEY, NOW)!.issuedAt).toBe(Math.floor(NOW / 1000) * 1000);
  });

  test('a Telegram token carries the numeric user id', () => {
    const token = signLinkToken({ kind: 'telegram', id: '7781234567' }, KEY, NOW);
    expect(verifyLinkToken(token, KEY, NOW)).toMatchObject({ kind: 'telegram', id: '7781234567' });
  });

  test.each([['telegram', '42', 15], ['account', ACCOUNT, 5]] as const)('a %s link expires after %i minutes', (kind, id, minutes) => {
    const token = signLinkToken({ kind, id }, KEY, NOW);
    expect(verifyLinkToken(token, KEY, NOW + minutes * 60_000 - 1000)).not.toBeNull();
    expect(verifyLinkToken(token, KEY, NOW + minutes * 60_000 + 1000)).toBeNull();
  });

  test('is refused when tampered with, signed with another key, or malformed', () => {
    const token = signLinkToken({ kind: 'account', id: ACCOUNT }, KEY, NOW);
    const flipped = (token[3] === 'A' ? 'B' : 'A');
    expect(verifyLinkToken(token.slice(0, 3) + flipped + token.slice(4), KEY, NOW)).toBeNull();
    expect(verifyLinkToken(token, linkKey('another_secret'), NOW)).toBeNull();
    for (const bad of ['', 'x', 'a'.repeat(50), `${token}x`, '!'.repeat(50)]) expect(verifyLinkToken(bad, KEY, NOW)).toBeNull();
  });

  test('the key is derived, never the secret itself', () => {
    expect(linkKey('sb_secret_test').toString()).not.toContain('sb_secret_test');
  });
});
