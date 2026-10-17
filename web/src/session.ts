import { useCallback, useState } from 'react';

const STORAGE_KEY = 'guild-admin-api-key';

// Storage can be blocked (private windows, strict settings): never let that break the app.
export function loadKey(): string | null {
  try { return sessionStorage.getItem(STORAGE_KEY); } catch { return null; }
}
export function saveKey(key: string) {
  try { sessionStorage.setItem(STORAGE_KEY, key); } catch { /* keep it in memory only */ }
}
export function clearKey() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* nothing stored */ }
}

export function useSession() {
  const [apiKey, setApiKey] = useState<string | null>(loadKey);

  const login = useCallback((key: string) => {
    saveKey(key);
    setApiKey(key);
  }, []);
  const logout = useCallback(() => {
    clearKey();
    setApiKey(null);
  }, []);

  return { apiKey, login, logout };
}
