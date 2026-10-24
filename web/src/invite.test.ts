import { describe, expect, test } from 'vitest';
import { MACRO_LIMIT, inviteMacros } from './invite';

const char = (name: string, realm = 'Silvermoon') => ({ name, realm });

describe('inviteMacros', () => {
  test('one /invite line per character, realm written the way the game wants it (no spaces or dashes)', () => {
    expect(inviteMacros([char('Jaina'), char('Thrall', 'Argent Dawn'), char('Rexxar', 'Azjol-Nerub')])).toEqual([
      '/invite Jaina-Silvermoon\n/invite Thrall-ArgentDawn\n/invite Rexxar-AzjolNerub',
    ]);
  });

  test('splits into macros that fit the in-game 255-character limit, never cutting a line', () => {
    const macros = inviteMacros(Array.from({ length: 30 }, (_, i) => char(`Raider${i}`)));

    expect(macros.length).toBeGreaterThan(1);
    expect(macros.every(m => m.length <= MACRO_LIMIT)).toBe(true);
    expect(macros.join('\n').split('\n')).toHaveLength(30);
  });

  test('counts bytes, not letters: accented names fill a macro sooner', () => {
    const macros = inviteMacros(Array.from({ length: 30 }, (_, i) => char(`Ðéàthöñ${i}`, 'Kel\'Thuzad')));
    expect(macros.every(m => new TextEncoder().encode(m).length <= MACRO_LIMIT)).toBe(true);
    expect(macros[0]).toContain('-Kel\'Thuzad'); // apostrophes stay, like in the game
  });

  test('no characters, no macros', () => {
    expect(inviteMacros([])).toEqual([]);
  });
});
