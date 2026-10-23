import { describe, expect, test } from 'vitest';
import { passwordProblem } from './password';

describe('passwordProblem', () => {
  test.each([
    'Correct-horse1', // lower, upper, digit, symbol
    'correct horse 1!', // lower, digit, symbol
  ])('accepts %j', (password) => {
    expect(passwordProblem(password, 'ulfgaar')).toBeNull();
  });

  test.each([
    ['Short-1a', /12 characters/],
    ['x'.repeat(73), /72 characters/],
    ['correcthorsebattery', /3 of/],
    ['CORRECTHORSE12', /3 of/],
    ['Ulfgaar-2026!', /nickname/],
    ['my-ULFGAAR-pass1', /nickname/],
  ])('refuses %j', (password, reason) => {
    expect(passwordProblem(password, 'ulfgaar')).toMatch(reason);
  });

  test('counts characters, not bytes (accents and emoji are one each)', () => {
    expect(passwordProblem('Èèèèèèèèè-1a', 'ulfgaar')).toBeNull();
  });
});

describe('PASSWORD_RULES (the checklist the site ticks while typing)', () => {
  test('lists each rule with whether this password passes it', async () => {
    const { PASSWORD_RULES } = await import('./password.js');
    const ticks = (password: string) => PASSWORD_RULES.map(rule => rule.ok(password, 'ulfgaar'));
    expect(PASSWORD_RULES.map(rule => rule.label)).toEqual([
      'At least 12 characters', '3 of: lowercase, uppercase, digits, symbols', 'Not containing your nickname',
    ]);
    expect(ticks('')).toEqual([false, false, true]);
    expect(ticks('ulfgaar')).toEqual([false, false, false]);
    expect(ticks('Correct-horse1')).toEqual([true, true, true]);
  });
});
