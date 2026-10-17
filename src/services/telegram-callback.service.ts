import { z } from 'zod';
import { prisma } from '../config/db.js';
import { UserRepository } from '../repositories/user.repository.js';
import { EventIdSchema } from '../validators/event.validator.js';
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

const STATUS_BY_ACTION = { in: 'IN', out: 'OUT', tent: 'TENTATIVE' } as const;
const CALLBACK_DATA = /^raid_(in|out|tent)_(.+)$/;

const userRepo = new UserRepository();
const responseService = new ResponseService();

export interface CallbackResult {
  text: string;
  /** True when the user must register before answering. */
  register?: true;
}

/** Applies a button press and returns what to show to the user. */
export async function handleCallbackQuery(query: CallbackQuery): Promise<CallbackResult> {
  const match = CALLBACK_DATA.exec(query.data);
  const eventId = EventIdSchema.safeParse(match?.[2]);
  if (!match || !eventId.success) return { text: 'Invalid action' };

  const platformUserId = String(query.from.id);
  const user = await userRepo.upsertFromIdentity('telegram', platformUserId, query.from.username ?? query.from.first_name ?? platformUserId);

  const character = await prisma.character.findFirst({ where: { userId: user.id, isMain: true } });
  if (!character) return { text: 'Register your main character with the bot first.', register: true };

  const status = STATUS_BY_ACTION[match[1] as keyof typeof STATUS_BY_ACTION];
  try {
    await responseService.updateResponse(eventId.data, character.id, status);
  } catch (error) {
    if (error instanceof EventLockedError) return { text: 'Sign-ups are closed for this event.' };
    throw error;
  }
  return { text: `Response saved: ${status}` };
}
