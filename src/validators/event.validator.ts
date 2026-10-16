import { z } from 'zod';
import { ResponseStatus } from '@prisma/client';

export const EventIdSchema = z.string().uuid("Invalid event ID");

export const EventParamsSchema = z.object({ id: EventIdSchema });

export const ListEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const CreateEventSchema = z.object({
  title: z.string().min(1, "Title is required").max(100),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  description: z.string().optional(),
  createdByUserId: z.string().uuid("Invalid user ID"),
});

export const FinalizeRosterSchema = z.object({
  selections: z.array(
    z.object({
      characterId: z.string().uuid("Invalid character ID"),
      status: z.enum(ResponseStatus),
      isConfirmed: z.boolean(),
    })
  ),
});

export type CreateEventInput = z.infer<typeof CreateEventSchema>;
export type FinalizeRosterInput = z.infer<typeof FinalizeRosterSchema>;
