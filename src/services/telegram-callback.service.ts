import { z } from 'zod';
import { prisma } from '../config/db.js';
import { EventIdSchema } from '../validators/event.validator.js';
import { NotFoundError } from '../lib/errors.js';
import { expectFollowUp, moveFollowUp } from './followup.service.js';
import type { Reply } from './link.service.js';
import { EventLockedError, ResponseService } from './response.service.js';

export const CallbackQuerySchema = z.object({
  id: z.string(),
  data: z.string(),
  from: z.object({
    id: z.number(),
    username: z.string().optional(),
    first_name: z.string().optional(),
  }),
});
export type CallbackQuery = z.infer<typeof CallbackQuerySchema>;

const STATUS_BY_ACTION = { in: 'IN', out: 'OUT', tent: 'TENTATIVE', late: 'LATE' } as const;
// raid_<answer>_<event> from the channel; as_<key>_<event> from the DM: answer with another of my characters.
// The key is the start of the character id (the whole id would pass Telegram's 64 bytes); it is only matched
// against the presser's own approved characters, so it can't reach anyone else's.
const CALLBACK_DATA = /^(?:raid_(in|out|tent|late)|as_([0-9a-f]{1,8}))_(.+)$/;
const KEY_LENGTH = 8;

const responseService = new ResponseService();

export interface CallbackResult {
  text: string;
  /** True when the user must link Telegram (or get a character approved) before answering: the bot sends the way. */
  register?: true;
  /** A follow-up sent privately to the user (minutes of delay, the other characters to answer with). */
  dm?: Reply;
}

type Candidate = { id: string; name: string };

/** Which character answers: the one already answering for this event, else the first (main first). */
async function answering(eventId: string, characters: Candidate[]) {
  const current = await prisma.response.findFirst({
    where: { eventId, characterId: { in: characters.map(c => c.id) } }, select: { characterId: true },
  });
  return characters.find(c => c.id === current?.characterId);
}

/** "Answering with X" plus a button for each other approved character, when there are any. */
function otherCharacters(eventId: string, characters: Candidate[], chosen: Candidate): Reply | undefined {
  if (characters.length < 2) return undefined;
  const buttons = characters.filter(c => c.id !== chosen.id).map(c => [{ text: c.name, callback_data: `as_${c.id.slice(0, KEY_LENGTH)}_${eventId}` }]);
  return { text: `Answering with ${chosen.name}. Coming with another character? Tap it.`, keyboard: { inline_keyboard: buttons } };
}

function closedOrMissing(error: unknown): CallbackResult {
  if (error instanceof EventLockedError) return { text: `${error.message}.` };
  if (error instanceof NotFoundError) return { text: 'This event no longer exists.' };
  throw error;
}

async function answer(query: CallbackQuery, eventId: string, status: (typeof STATUS_BY_ACTION)[keyof typeof STATUS_BY_ACTION], characters: Candidate[]) {
  const character = (await answering(eventId, characters)) ?? characters[0]!;
  try {
    await responseService.updateResponse(eventId, character.id, status);
  } catch (error) {
    return closedOrMissing(error);
  }
  // The next private message is the note (with the minutes first for LATE).
  await expectFollowUp(query.from.id, eventId, character.id, status === 'LATE');
  const question = status === 'LATE'
    ? 'How many minutes late will you be? Send the number and a note if you want, for example: 15 traffic'
    : `${status} noted. Reply with a note if you want (for example: leaving 30 min early).`;
  const others = otherCharacters(eventId, characters, character);
  return {
    text: status === 'LATE' ? 'Late noted. Tell me the minutes in our private chat.' : `Response saved: ${status}`,
    dm: others ? { text: `${question}\n\n${others.text}`, keyboard: others.keyboard! } : { text: question },
  };
}

async function switchTo(query: CallbackQuery, eventId: string, key: string, characters: Candidate[]): Promise<CallbackResult> {
  const current = await answering(eventId, characters);
  if (!current) return { text: 'Answer in the channel first.' };
  const target = characters.find(c => c.id.startsWith(key));
  if (!target) return { text: 'That character is no longer in your approved list.' };
  if (target.id === current.id) return { text: `Already answering with ${target.name}.` };
  try {
    await responseService.moveResponse(eventId, current.id, target.id);
  } catch (error) {
    return closedOrMissing(error);
  }
  // A question still open (note, or LATE minutes not given yet) now goes to the new character.
  const moved = await prisma.response.findUnique({ where: { eventId_characterId: { eventId, characterId: target.id } }, select: { status: true, arrivalTime: true } });
  await moveFollowUp(query.from.id, eventId, current.id, target.id, moved?.status === 'LATE' && !moved.arrivalTime);
  return { text: `Now answering with ${target.name}.` };
}

/** Applies a button press and returns what to show to the user. */
export async function handleCallbackQuery(query: CallbackQuery): Promise<CallbackResult> {
  const match = CALLBACK_DATA.exec(query.data);
  const eventId = EventIdSchema.safeParse(match?.[3]);
  if (!match || !eventId.success) return { text: 'Invalid action' };

  // Read only: a button press must never create users or rename an account after its Telegram name.
  const identity = await prisma.identity.findUnique({
    where: { platform_platformUserId: { platform: 'telegram', platformUserId: String(query.from.id) } },
    select: { userId: true },
  });
  if (!identity) return { text: 'Link your Telegram to your guild account first.', register: true };

  // Only characters an officer approved for the roster answer; the main comes first.
  const characters = await prisma.character.findMany({
    where: { userId: identity.userId, inRoster: true },
    orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, name: true },
  });
  if (characters.length === 0) {
    return { text: 'Add your character on the guild site and wait for an officer to approve it.', register: true };
  }

  const action = match[1] as keyof typeof STATUS_BY_ACTION | undefined;
  return action
    ? answer(query, eventId.data, STATUS_BY_ACTION[action], characters)
    : switchTo(query, eventId.data, match[2]!, characters);
}
