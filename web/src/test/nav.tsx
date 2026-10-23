import type { ReactNode } from 'react';
import EventPage from '../app/events/[id]/page';
import EventsPage from '../app/events/page';
import RosterPage from '../app/roster/page';
import { useTestPath } from './navState';

export { currentPath, navigate } from './navState';

/** What Next would render for the current URL, so App tests see real pages. */
export function Routed(): ReactNode {
  const p = useTestPath();
  if (p.startsWith('/roster')) return <RosterPage />;
  return p.startsWith('/events/') ? <EventPage /> : <EventsPage />;
}
