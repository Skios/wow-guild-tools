import type { EventState } from '../types';

const LABEL: Record<EventState, string> = { OPEN: 'Open', CLOSED: 'Closed', CANCELED: 'Cancelled', STARTED: 'Started', ENDED: 'Ended' };

/** Open -> Closed (published) or Cancelled before the start; Started and Ended follow the clock. */
export function EventStateBadge({ state }: { state: EventState }) {
  return <span className={`badge badge-${state.toLowerCase()}`}>{LABEL[state]}</span>;
}
