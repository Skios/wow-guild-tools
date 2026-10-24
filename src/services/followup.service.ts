import { prisma } from '../config/db.js';
import { NotFoundError } from '../lib/errors.js';
import { draftStore } from '../repositories/draft.repository.js';
import type { Reply } from './link.service.js';
import { EventLockedError, NotApprovedError, ResponseService } from './response.service.js';

export const MAX_LATE_MINUTES = 720;
export const MAX_NOTE_LENGTH = 200;
// LATE: the minutes, then an optional note ("15 traffic").
const LATE = /^(\d{1,3})(?:\s+([\s\S]+))?$/;

interface FollowUp {
  eventId: string;
  characterId: string;
  /** LATE answers wait for the minutes (and a note); the others only for a note. */
  late: boolean;
}

// Stored in the database: on serverless the answer may reach another instance than the question.
const pending = draftStore<FollowUp>('answer');
const responses = new ResponseService();

/** After a button press, the player's next private message is read as the note (and the minutes for LATE). */
export async function expectFollowUp(telegramUserId: number, eventId: string, characterId: string, late: boolean) {
  await pending.set(telegramUserId, { eventId, characterId, late });
}

/** The answer moved to another character: a question still open about that same answer follows it. */
export async function moveFollowUp(telegramUserId: number, eventId: string, from: string, to: string, late: boolean) {
  const draft = await pending.get(telegramUserId);
  if (draft?.eventId === eventId && draft.characterId === from) await pending.set(telegramUserId, { ...draft, characterId: to, late });
}

const GONE = 'That character is no longer yours or no longer approved for the roster: ask an officer.';
const ASK_MINUTES = `Send the minutes (0 to ${MAX_LATE_MINUTES}) and a note if you want, for example: 15 traffic`;

/** The character must still belong to whoever answers (it may have been released or reassigned meanwhile). */
const stillTheirs = async (telegramUserId: number, characterId: string) =>
  (await prisma.character.count({
    where: { id: characterId, user: { identities: { some: { platform: 'telegram', platformUserId: String(telegramUserId) } } } },
  })) > 0;

/** What the message says: minutes (LATE) and the note; a string when it must be asked again. */
function parse(draft: FollowUp, text: string): { minutes?: number; note: string | null } | string {
  let note: string | undefined = text;
  let minutes: number | undefined;
  if (draft.late) {
    const match = LATE.exec(text);
    if (!match || Number(match[1]) > MAX_LATE_MINUTES) return ASK_MINUTES;
    minutes = Number(match[1]);
    note = match[2]?.trim();
  }
  if (note && note.length > MAX_NOTE_LENGTH) return `Notes are at most ${MAX_NOTE_LENGTH} characters. Send a shorter one.`;
  return { ...(minutes !== undefined && { minutes }), note: note || null };
}

function thanks(minutes: number | undefined, note: string | null) {
  const late = minutes === undefined ? '' : minutes === 0 ? "you'll be on time" : `late by ${minutes} min`;
  const parts = [late, note && `note "${note}"`].filter(Boolean);
  return `Noted: ${parts.join(', ')}.`;
}

/** Returns null when this message answers no question, so other handlers can take it. */
export async function handleFollowUp(message: { from: { id: number }; text: string }): Promise<Reply | null> {
  const draft = await pending.get(message.from.id);
  if (!draft) return null;

  const text = message.text.trim();
  if (text.startsWith('/')) {
    await pending.delete(message.from.id); // a command abandons the question
    return null;
  }
  const parsed = parse(draft, text);
  if (typeof parsed === 'string') return { text: parsed };

  if (!(await stillTheirs(message.from.id, draft.characterId))) {
    await pending.delete(message.from.id);
    return { text: GONE };
  }
  try {
    if (parsed.minutes !== undefined) await responses.updateResponse(draft.eventId, draft.characterId, 'LATE', undefined, parsed.minutes);
    if (parsed.note) await responses.setNote(draft.eventId, draft.characterId, parsed.note);
  } catch (error) {
    const closed = error instanceof EventLockedError ? `${error.message}.`
      : error instanceof NotFoundError ? 'This event or your answer no longer exists.'
        : error instanceof NotApprovedError ? GONE : null;
    if (!closed) throw error; // keep the question open so the player can retry
    await pending.delete(message.from.id);
    return { text: closed };
  }
  await pending.delete(message.from.id);
  return { text: thanks(parsed.minutes, parsed.note) };
}
