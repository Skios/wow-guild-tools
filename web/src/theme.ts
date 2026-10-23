import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PREFS, ICON_STYLES, STORAGE_KEY, THEMES, type IconStyle, type Option, type Prefs, type ThemeId } from './themes';

export * from './themes';

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
  // Prerender has no localStorage (loadPrefs falls back to defaults); no prefs-dependent markup renders
  // before the session resolves, so this cannot cause a hydration mismatch. Keep it that way.
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);

  useEffect(() => {
    applyPrefs(prefs);
    savePrefs(prefs);
  }, [prefs]);

  const setTheme = useCallback((theme: ThemeId) => setPrefs(p => ({ ...p, theme })), []);
  const setIcons = useCallback((icons: IconStyle) => setPrefs(p => ({ ...p, icons })), []);
  return { prefs, setTheme, setIcons };
}
