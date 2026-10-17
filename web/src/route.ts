import { useSyncExternalStore } from 'react';

export type Route = { name: 'events' } | { name: 'event'; id: string };

const EVENTS: Route = { name: 'events' };

export const eventPath = (id: string) => `#/events/${encodeURIComponent(id)}`;

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/');
  if (parts.length === 2 && parts[0] === 'events' && parts[1]) {
    try {
      return { name: 'event', id: decodeURIComponent(parts[1]) };
    } catch {
      return EVENTS; // malformed escape sequence
    }
  }
  return EVENTS;
}

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseHash(hash);
}
