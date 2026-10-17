const DASH = '—';
const HOUR_MS = 3_600_000;

const full = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const timeOnly = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

function parse(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(iso: string): string {
  const date = parse(iso);
  return date ? full.format(date) : DASH;
}

export function formatRange(startIso: string, endIso: string): string {
  const start = parse(startIso);
  const end = parse(endIso);
  if (!start || !end) return `${formatDateTime(startIso)} – ${formatDateTime(endIso)}`;
  const sameDay = start.toDateString() === end.toDateString();
  return `${full.format(start)} – ${sameDay ? timeOnly.format(end) : full.format(end)}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `datetime-local` value (local time, no zone) to a UTC ISO string; null if it is not a real date. */
export function localInputToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  const date = new Date(year, month - 1, day, hour, minute);
  // new Date() rolls 30 February over to March, so check the parts survived.
  const intact = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    && date.getHours() === hour && date.getMinutes() === minute;
  return intact ? date.toISOString() : null;
}

/** `datetime-local` value for the next full hour after `from`, plus `addHours`. */
export function toLocalInput(from: Date, addHours = 0): string {
  const rounded = new Date(from);
  if (rounded.getMinutes() || rounded.getSeconds() || rounded.getMilliseconds()) {
    rounded.setHours(rounded.getHours() + 1, 0, 0, 0);
  }
  const date = new Date(rounded.getTime() + addHours * HOUR_MS);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "21:15" for an ISO date, or a dash if it is not a date. */
export function formatTime(iso: string): string {
  const date = parse(iso);
  return date ? timeOnly.format(date) : DASH;
}

/** When a late player arrives: the event start plus their delay. */
export function arrivalTime(startIso: string, minutes: number): string {
  const start = parse(startIso);
  return start ? new Date(start.getTime() + minutes * 60_000).toISOString() : '';
}
