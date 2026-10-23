import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { applyPrefs, DEFAULT_PREFS, ICON_STYLES, loadPrefs, savePrefs, THEME_BOOT_SCRIPT, THEMES, usePrefs } from './theme';

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-icons');
});

describe('options', () => {
  test('offers four themes and three icon styles, each with a label and a description', () => {
    expect(THEMES.map(t => t.id)).toEqual(['midnight', 'parchment', 'void', 'daylight']);
    expect(ICON_STYLES.map(i => i.id)).toEqual(['game', 'line', 'none']);
    for (const option of [...THEMES, ...ICON_STYLES]) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.description.length).toBeGreaterThan(0);
    }
  });

  test('has both a dark and a light theme', () => {
    expect(THEMES.some(t => t.scheme === 'dark')).toBe(true);
    expect(THEMES.some(t => t.scheme === 'light')).toBe(true);
  });
});

describe('loadPrefs / savePrefs', () => {
  test('defaults when nothing is stored', () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  test('round trips', () => {
    savePrefs({ theme: 'void', icons: 'line' });
    expect(loadPrefs()).toEqual({ theme: 'void', icons: 'line' });
  });

  test.each([
    ['not json'],
    ['null'],
    ['42'],
    ['{"theme":"neon","icons":"game"}'],
    ['{"theme":"void","icons":"emoji"}'],
    ['{"theme":5}'],
    ['[]'],
  ])('ignores the corrupt value %j and falls back field by field', (raw) => {
    localStorage.setItem('guild-admin-prefs', raw);
    const prefs = loadPrefs();
    expect(THEMES.map(t => t.id)).toContain(prefs.theme);
    expect(ICON_STYLES.map(i => i.id)).toContain(prefs.icons);
  });

  test('keeps the valid half of a half-valid value', () => {
    localStorage.setItem('guild-admin-prefs', '{"theme":"parchment","icons":"emoji"}');
    expect(loadPrefs()).toEqual({ theme: 'parchment', icons: DEFAULT_PREFS.icons });
  });

  test('survives blocked storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });

    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    expect(() => savePrefs({ theme: 'void', icons: 'none' })).not.toThrow();
  });
});

describe('applyPrefs', () => {
  test('exposes the choices as attributes the stylesheet can target', () => {
    applyPrefs({ theme: 'parchment', icons: 'none' });

    expect(document.documentElement.dataset.theme).toBe('parchment');
    expect(document.documentElement.dataset.icons).toBe('none');
  });

  test('tells the browser whether the page is light or dark, for scrollbars and form controls', () => {
    applyPrefs({ theme: 'daylight', icons: 'game' });
    expect(document.documentElement.style.colorScheme).toBe('light');
    applyPrefs({ theme: 'void', icons: 'game' });
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });
});

describe('usePrefs', () => {
  test('applies the stored choices on first render', () => {
    savePrefs({ theme: 'daylight', icons: 'line' });
    renderHook(() => usePrefs());
    expect(document.documentElement.dataset.theme).toBe('daylight');
  });

  test('changing the theme applies it and remembers it', () => {
    const { result } = renderHook(() => usePrefs());

    act(() => result.current.setTheme('void'));

    expect(result.current.prefs.theme).toBe('void');
    expect(document.documentElement.dataset.theme).toBe('void');
    expect(loadPrefs().theme).toBe('void');
  });

  test('changing the icon style leaves the theme alone', () => {
    savePrefs({ theme: 'parchment', icons: 'game' });
    const { result } = renderHook(() => usePrefs());

    act(() => result.current.setIcons('line'));

    expect(result.current.prefs).toEqual({ theme: 'parchment', icons: 'line' });
    expect(document.documentElement.dataset.icons).toBe('line');
  });
});

describe('THEME_BOOT_SCRIPT', () => {
  const boot = () => new Function(THEME_BOOT_SCRIPT)();
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-icons');
    document.documentElement.style.colorScheme = '';
  });

  test('puts the saved look on <html> before React runs', () => {
    localStorage.setItem('guild-admin-prefs', JSON.stringify({ theme: 'parchment', icons: 'line' }));
    boot();
    expect(document.documentElement.dataset).toMatchObject({ theme: 'parchment', icons: 'line' });
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  test.each([null, '{bad json', '"str"', JSON.stringify({ theme: 'constructor', icons: 'x' })])(
    'falls back to the defaults for %j',
    (stored) => {
      if (stored !== null) localStorage.setItem('guild-admin-prefs', stored);
      boot();
      expect(document.documentElement.dataset).toMatchObject({ theme: 'midnight', icons: 'game' });
      expect(document.documentElement.style.colorScheme).toBe('dark');
    },
  );

  test('never throws when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(boot).not.toThrow();
    vi.restoreAllMocks();
  });
});
