import { z } from 'zod';

export const CreateEventSchema = z.object({
  title: z.string().min(1, "Title is required").max(100),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  description: z.string().optional(),
  createdByUserId: z.string().uuid("Invalid user ID"),
});

export type CreateEventInput = z.infer<typeof CreateEventSchema>;
