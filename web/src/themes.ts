// Plain data (no React) so the server-rendered root layout can use it.
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
export const STORAGE_KEY = 'guild-admin-prefs';

/**
 * Runs in <head> before first paint so the saved look is on <html> from the start (no flash of the default
 * theme). Same rules as loadPrefs/applyPrefs, driven by the same lists.
 */
export const THEME_BOOT_SCRIPT = `var s=${JSON.stringify(Object.fromEntries(THEMES.map(t => [t.id, t.scheme])))},i=${JSON.stringify(ICON_STYLES.map(o => o.id))},p={},r=document.documentElement;try{p=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}))||{}}catch(e){}var t=Object.hasOwn(s,p.theme)?p.theme:${JSON.stringify(DEFAULT_PREFS.theme)};r.dataset.theme=t;r.style.colorScheme=s[t];r.dataset.icons=i.includes(p.icons)?p.icons:${JSON.stringify(DEFAULT_PREFS.icons)}`;
