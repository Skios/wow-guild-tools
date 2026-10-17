import { useCallback, useEffect, useState } from 'react';

export type ThemeId = 'midnight' | 'parchment' | 'void' | 'daylight';
export type IconStyle = 'game' | 'line' | 'none';

export interface Option<T extends string> {
  id: T;
  label: string;
  description: string;
}

export const THEMES: (Option<ThemeId> & { scheme: 'dark' | 'light' })[] = [
  { id: 'midnight', label: 'Midnight', description: 'Deep navy with gold accents. The classic raid-night look.', scheme: 'dark' },
  { id: 'parchment', label: 'Parchment', description: 'Warm paper and bronze, like an old quest log.', scheme: 'light' },
  { id: 'void', label: 'Void', description: 'Modern near-black with violet glow and soft glass panels.', scheme: 'dark' },
  { id: 'daylight', label: 'Daylight', description: 'Clean, bright and neutral. Easy on a sunny screen.', scheme: 'light' },
];

export const ICON_STYLES: Option<IconStyle>[] = [
  { id: 'game', label: 'Game icons', description: 'The real specialization and class icons.' },
  { id: 'line', label: 'Line icons', description: 'Simple shield, cross, sword and bow by role.' },
  { id: 'none', label: 'No icons', description: 'Names and colours only.' },
];

export interface Prefs {
  theme: ThemeId;
  icons: IconStyle;
}

export const DEFAULT_PREFS: Prefs = { theme: 'midnight', icons: 'game' };
const STORAGE_KEY = 'guild-admin-prefs';

const pick = <T extends string>(options: Option<T>[], value: unknown, fallback: T): T =>
  options.find(o => o.id === value)?.id ?? fallback;

/** Reads the saved choices; anything missing or corrupt falls back field by field. */
export function loadPrefs(): Prefs {
  let stored: unknown = null;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch { /* blocked storage or corrupt JSON: use defaults */ }
  const record = typeof stored === 'object' && stored !== null && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  return {
    theme: pick(THEMES, record.theme, DEFAULT_PREFS.theme),
    icons: pick(ICON_STYLES, record.icons, DEFAULT_PREFS.icons),
  };
}

export function savePrefs(prefs: Prefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* optional convenience */ }
}

export function applyPrefs(prefs: Prefs, root: HTMLElement = document.documentElement) {
  root.dataset.theme = prefs.theme;
  root.dataset.icons = prefs.icons;
  root.style.colorScheme = THEMES.find(t => t.id === prefs.theme)?.scheme ?? 'dark';
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);

  useEffect(() => {
    applyPrefs(prefs);
    savePrefs(prefs);
  }, [prefs]);

  const setTheme = useCallback((theme: ThemeId) => setPrefs(p => ({ ...p, theme })), []);
  const setIcons = useCallback((icons: IconStyle) => setPrefs(p => ({ ...p, icons })), []);
  return { prefs, setTheme, setIcons };
}
