// Reminders are minutes before the event starts; the API checks the same limits.
export const DEFAULT_REMINDERS = [1440, 480];
export const MIN_REMINDER_MINUTES = 5;
export const MAX_REMINDER_MINUTES = 14 * 24 * 60;
export const MAX_REMINDERS = 5;

const DAY = 1440;
const HOUR = 60;

/** 1800 → "1 day 6 h before". */
export function beforeLabel(minutes: number): string {
  const days = Math.floor(minutes / DAY);
  const hours = Math.floor((minutes % DAY) / HOUR);
  const mins = minutes % HOUR;
  const parts = [days && `${days} day${days === 1 ? '' : 's'}`, hours && `${hours} h`, mins && `${mins} min`].filter(Boolean);
  return `${parts.join(' ')} before`;
}

/** Why `minutes` can't join `list`, or null. */
export function reminderError(list: number[], minutes: number): string | null {
  if (!Number.isInteger(minutes)) return 'Use whole minutes';
  if (minutes < MIN_REMINDER_MINUTES) return `A reminder is at least ${MIN_REMINDER_MINUTES} minutes before the start`;
  if (minutes > MAX_REMINDER_MINUTES) return 'A reminder is at most 14 days before the start';
  if (list.includes(minutes)) return `There is already a reminder ${beforeLabel(minutes)}`;
  if (list.length >= MAX_REMINDERS) return `An event has at most ${MAX_REMINDERS} reminders`;
  return null;
}
