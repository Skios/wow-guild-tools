import { z } from 'zod';

export const EventIdSchema = z.string().uuid("Invalid event ID");

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
      status: z.enum(['confirmed', 'pending', 'declined']),
      isConfirmed: z.boolean(),
    })
  ),
});

export type CreateEventInput = z.infer<typeof CreateEventSchema>;
export type FinalizeRosterInput = z.infer<typeof FinalizeRosterSchema>;
