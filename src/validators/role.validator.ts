import { z } from 'zod';

const MAX_POSITION = 1000;
const MAX_CAPABILITIES = 50;

// Position 0 belongs to the Owner role; every other role sits below it. Capability names are checked
// against the ones the code registers in RoleService (they are only known once the routes exist).
export const RoleInputSchema = z.strictObject({
  name: z.string().trim().min(2, 'Role name: 2-32 characters').max(32, 'Role name: 2-32 characters'),
  position: z.number().int().min(1, 'Position: 1 or more (0 is the Owner)').max(MAX_POSITION),
  capabilities: z.array(z.string()).max(MAX_CAPABILITIES)
    .refine(list => new Set(list).size === list.length, 'A capability is listed twice'),
});
export type RoleInput = z.infer<typeof RoleInputSchema>;

export const AssignRoleSchema = z.strictObject({ roleId: z.uuid() });
