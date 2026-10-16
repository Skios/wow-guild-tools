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

/** Applies a button press and returns the text to show to the user. */
export async function handleCallbackQuery(query: CallbackQuery): Promise<string> {
  const match = CALLBACK_DATA.exec(query.data);
  const eventId = EventIdSchema.safeParse(match?.[2]);
  if (!match || !eventId.success) return 'Invalid action';

  const platformId = String(query.from.id);
  const user = await userRepo.createFromPlatform(platformId, query.from.username ?? query.from.first_name ?? platformId);

  const character = await prisma.character.findFirst({ where: { userId: user.id, isMain: true } });
  if (!character) return 'No main character set: ask an officer to register one for you.';

  const status = STATUS_BY_ACTION[match[1] as keyof typeof STATUS_BY_ACTION];
  try {
    await responseService.updateResponse(eventId.data, character.id, status);
  } catch (error) {
    if (error instanceof EventLockedError) return 'Sign-ups are closed for this event.';
    throw error;
  }
  return `Response saved: ${status}`;
}
