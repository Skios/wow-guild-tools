import { ResponseStatus } from '@prisma/client';
import { z } from 'zod';

const HOUR_MS = 3_600_000;
export const MAX_EVENT_HOURS = 24;
export const MAX_ADVANCE_DAYS = 365;
export const MAX_ROSTER_SIZE = 100;

export const EventIdSchema = z.string().uuid("Invalid event ID");

export const EventParamsSchema = z.object({ id: EventIdSchema });

export const ListEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const DateTimeSchema = z.string().datetime({ offset: true });

export const CreateEventSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(100),
    startTime: DateTimeSchema,
    endTime: DateTimeSchema,
    description: z.string().max(1000).optional(),
    createdByUserId: z.string().uuid("Invalid user ID"),
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
        })
        .refine(s => !s.isConfirmed || s.status === 'IN', {
          message: 'Only players marked IN can be confirmed',
          path: ['isConfirmed'],
        }),
    )
    .min(1, 'Select at least one character')
    .max(MAX_ROSTER_SIZE)
    .refine(list => new Set(list.map(s => s.characterId)).size === list.length, {
      message: 'A character can appear only once',
    }),
});

export type CreateEventInput = z.infer<typeof CreateEventSchema>;
export type FinalizeRosterInput = z.infer<typeof FinalizeRosterSchema>;
