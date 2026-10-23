import { prisma } from '../config/db.js';
import { NotFoundError } from '../lib/errors.js';
import { draftStore } from '../repositories/draft.repository.js';
import type { Reply } from './link.service.js';
import { EventLockedError, NotApprovedError, ResponseService } from './response.service.js';

export const MAX_LATE_MINUTES = 720;
const MINUTES = /^\d{1,3}$/;

interface Pending {
  eventId: string;
  characterId: string;
}

// Stored in the database: on serverless the answer may reach another instance than the question.
const pending = draftStore<Pending>('late');
const responses = new ResponseService();

/** After a player pressed LATE, their next private message is read as "minutes late". */
export async function expectLateMinutes(telegramUserId: number, eventId: string, characterId: string) {
  await pending.set(telegramUserId, { eventId, characterId });
}

/** Another answer came in: the minutes question no longer applies. */
export async function forgetLateMinutes(telegramUserId: number) {
  await pending.delete(telegramUserId);
}

const GONE = 'That character is no longer yours or no longer approved for the roster: ask an officer.';

/** The character must still belong to whoever answers (it may have been released or reassigned meanwhile). */
const stillTheirs = async (telegramUserId: number, characterId: string) =>
  (await prisma.character.count({
    where: { id: characterId, user: { identities: { some: { platform: 'telegram', platformUserId: String(telegramUserId) } } } },
  })) > 0;

/** Returns null when this message is not an answer to the late question. */
export async function handleLateMessage(message: { from: { id: number }; text: string }): Promise<Reply | null> {
  const draft = await pending.get(message.from.id);
  if (!draft) return null;

  const text = message.text.trim();
  if (text.startsWith('/')) {
    await pending.delete(message.from.id); // a command abandons the question
    return null;
  }
  if (!MINUTES.test(text) || Number(text) > MAX_LATE_MINUTES) {
    return { text: `Send a number of minutes between 0 and ${MAX_LATE_MINUTES}, for example 15.` };
  }

  const minutes = Number(text);
  if (!(await stillTheirs(message.from.id, draft.characterId))) {
    await pending.delete(message.from.id);
    return { text: GONE };
  }
  try {
    await responses.updateResponse(draft.eventId, draft.characterId, 'LATE', undefined, minutes);
  } catch (error) {
    if (error instanceof EventLockedError) {
      await pending.delete(message.from.id);
      return { text: 'Sign-ups are closed for this event.' };
    }
    if (error instanceof NotFoundError) {
      await pending.delete(message.from.id);
      return { text: 'This event no longer exists.' };
    }
    if (error instanceof NotApprovedError) {
      await pending.delete(message.from.id);
      return { text: GONE };
    }
    throw error; // keep the question open so the player can retry
  }
  await pending.delete(message.from.id);
  return { text: minutes === 0 ? "Noted: you'll be on time." : `Noted: late by ${minutes} min.` };
}
