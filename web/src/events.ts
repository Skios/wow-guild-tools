import type { EventSummary } from './types';

/** Upcoming and ongoing events first (soonest first), then past events (most recent first). */
export function orderEvents(events: EventSummary[], now: Date): EventSummary[] {
  const time = (iso: string) => Date.parse(iso) || 0;
  const upcoming = events.filter(e => time(e.endTime) >= now.getTime()).sort((a, b) => time(a.startTime) - time(b.startTime));
  const past = events.filter(e => time(e.endTime) < now.getTime()).sort((a, b) => time(b.startTime) - time(a.startTime));
  return [...upcoming, ...past];
}
