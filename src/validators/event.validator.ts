import { ResponseStatus } from '@prisma/client';
import { z } from 'zod';

const HOUR_MS = 3_600_000;
export const MAX_EVENT_HOURS = 24;
export const MAX_ADVANCE_DAYS = 365;
export const MAX_ROSTER_SIZE = 100;
export const MAX_LATE_MINUTES = 720;

export const EventIdSchema = z.string().uuid("Invalid event ID");

export const EventParamsSchema = z.object({ id: EventIdSchema });

export const ListEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const DateTimeSchema = z.string().datetime({ offset: true });

// Reminders are minutes before the start: 1440 = a day before.
export const MIN_REMINDER_MINUTES = 5;
export const MAX_REMINDER_MINUTES = 14 * 24 * 60;
export const MAX_REMINDERS = 5;
const RemindersSchema = z
  .array(z.number().int().min(MIN_REMINDER_MINUTES).max(MAX_REMINDER_MINUTES))
  .max(MAX_REMINDERS, `At most ${MAX_REMINDERS} reminders`)
  .refine(list => new Set(list).size === list.length, { message: 'Each reminder time once' });

export const SetRemindersSchema = z.object({ minutesBefore: RemindersSchema });

export const CreateEventSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(100),
    startTime: DateTimeSchema,
    endTime: DateTimeSchema,
    description: z.string().max(1000).optional(),
    reminders: RemindersSchema.optional(),
  })
  .superRefine((event, ctx) => {
    const start = Date.parse(event.startTime);
    const end = Date.parse(event.endTime);
    const now = Date.now();

    if (end <= start) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'End time must be after start time' });
      return;
    }
    if (end - start > MAX_EVENT_HOURS * HOUR_MS) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: `Events last at most ${MAX_EVENT_HOURS} hours` });
    }
    if (end <= now) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'Event has already ended' });
    }
    if (start - now > MAX_ADVANCE_DAYS * 24 * HOUR_MS) {
      ctx.addIssue({ code: 'custom', path: ['startTime'], message: `Events can be planned at most ${MAX_ADVANCE_DAYS} days ahead` });
    }
  });

export const FinalizeRosterSchema = z.object({
  selections: z
    .array(
      z
        .object({
          characterId: z.string().uuid("Invalid character ID"),
          status: z.enum(ResponseStatus),
          isConfirmed: z.boolean(),
          lateMinutes: z.number().int().min(0).max(MAX_LATE_MINUTES).optional(),
          // The spec played that night (an off-spec); null = the main one, missing = unchanged.
          spec: z.string().min(1).max(40).nullable().optional(),
        })
        .refine(s => !s.isConfirmed || s.status === 'IN' || s.status === 'LATE', {
          message: 'Only players marked IN or LATE can be confirmed',
          path: ['isConfirmed'],
        })
        .refine(s => s.lateMinutes === undefined || s.status === 'LATE', {
          message: 'Late minutes only apply to LATE',
          path: ['lateMinutes'],
        }),
    )
    .min(1, 'Select at least one character')
    .max(MAX_ROSTER_SIZE)
    .refine(list => new Set(list.map(s => s.characterId)).size === list.length, {
      message: 'A character can appear only once',
    }),
});

// The creator comes from the signed-in officer, never from the request body.
export type CreateEventInput = z.infer<typeof CreateEventSchema> & { createdByUserId?: string };
export type FinalizeRosterInput = z.infer<typeof FinalizeRosterSchema>;

export const SwitchCharacterParamsSchema = z.object({ id: EventIdSchema, characterId: z.string().uuid('Invalid character ID') });
export const SwitchCharacterSchema = z.object({ to: z.string().uuid('Invalid character ID') });

export const MAX_MESSAGE_LENGTH = 500;

export const MessageSchema = z.object({
  characterIds: z
    .array(z.string().uuid('Invalid character ID'))
    .min(1, 'Choose at least one person')
    .max(MAX_ROSTER_SIZE)
    .refine(list => new Set(list).size === list.length, { message: 'Each person can be chosen once' }),
  // Blank means "use the default reminder".
  text: z
    .string()
    .trim()
    .max(MAX_MESSAGE_LENGTH)
    .optional()
    .transform(text => text || undefined),
});
