import { useSyncExternalStore } from 'react';

// A tiny in-memory router standing in for next/navigation (see the vi.mock calls in setup.tsx).
let path = '/events';
const listeners = new Set<() => void>();

export const navigate = (next: string) => {
  path = next;
  listeners.forEach(l => l());
};
export const currentPath = () => path;
export const useTestPath = () =>
  useSyncExternalStore(l => (listeners.add(l), () => listeners.delete(l)), () => path);

