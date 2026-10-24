// An event's state. Officers set OPEN -> CLOSED (publish) and CANCELED; STARTED and ENDED come from the clock.
// CANCELED always wins; a published event that has started shows STARTED.
export type EventState = 'OPEN' | 'CLOSED' | 'CANCELED' | 'STARTED' | 'ENDED';

export function eventState(
  event: { isPublished: boolean; canceledAt: Date | null; startTime: Date; endTime: Date },
  now: Date = new Date(),
): EventState {
  if (event.canceledAt) return 'CANCELED';
  if (now >= event.endTime) return 'ENDED';
  if (now >= event.startTime) return 'STARTED';
  return event.isPublished ? 'CLOSED' : 'OPEN';
}
