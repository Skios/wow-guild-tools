import { localInputToIso } from './format';
import type { NewEvent } from './types';

export const MAX_TITLE = 100;
export const MAX_DESCRIPTION = 1000;
export const MAX_EVENT_HOURS = 24;

export interface EventFormValues {
  title: string;
  start: string;
  end: string;
  description: string;
  createdByUserId: string;
}

export type EventFormField = keyof EventFormValues;

export interface EventFormResult {
  errors: Partial<Record<EventFormField, string>>;
  payload: NewEvent | null;
}

/** Mirrors the API rules so officers get instant feedback; the server stays the authority. */
export function validateNewEvent(values: EventFormValues, now: Date = new Date()): EventFormResult {
  const errors: EventFormResult['errors'] = {};
  const title = values.title.trim();
  const description = values.description.trim();

  if (!title) errors.title = 'Title is required';
  else if (title.length > MAX_TITLE) errors.title = `Title is at most ${MAX_TITLE} characters`;
  if (description.length > MAX_DESCRIPTION) errors.description = `Description is at most ${MAX_DESCRIPTION} characters`;
  if (!values.createdByUserId) errors.createdByUserId = 'Choose who is creating the event';

  const startTime = localInputToIso(values.start);
  const endTime = localInputToIso(values.end);
  if (!startTime) errors.start = 'Enter a valid start';
  if (!endTime) errors.end = 'Enter a valid end';

  if (startTime && endTime) {
    const start = Date.parse(startTime);
    const end = Date.parse(endTime);
    if (end <= start) errors.end = 'End must be after start';
    else if (end - start > MAX_EVENT_HOURS * 3_600_000) errors.end = `Events last at most ${MAX_EVENT_HOURS} hours`;
    else if (end <= now.getTime()) errors.end = 'This event is already over';
  }

  if (Object.keys(errors).length > 0 || !startTime || !endTime) return { errors, payload: null };
  return {
    errors,
    payload: { title, startTime, endTime, createdByUserId: values.createdByUserId, ...(description && { description }) },
  };
}
