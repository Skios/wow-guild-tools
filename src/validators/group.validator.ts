import { z } from 'zod';

const Uuid = (label: string) => z.string().uuid(`Invalid ${label}`);

export const GroupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(50),
  description: z.string().max(500).optional(),
});

export const GroupIdParamsSchema = z.object({ id: Uuid('group ID') });
export const MemberBodySchema = z.object({ userId: Uuid('user ID') });
export const MemberParamsSchema = z.object({ id: Uuid('group ID'), userId: Uuid('user ID') });
