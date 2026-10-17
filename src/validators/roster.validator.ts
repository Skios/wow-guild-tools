import { WoWClass } from '@prisma/client';
import { z } from 'zod';
import { CLASS_INFO, isValidSpec, parseClassSpec } from '../domain/wow.js';
import { CharacterNameSchema, RealmSchema } from './character.validator.js';

export const RosterIdParamsSchema = z.object({ id: z.string().uuid('Invalid character ID') });

/** A roster slot as officers define it. The role is never taken from the client: it follows the spec. */
export const RosterEntrySchema = z
  .object({
    name: CharacterNameSchema,
    realm: RealmSchema,
    class: z.enum(WoWClass),
    spec: z.string().min(1, 'Choose a specialization'),
  })
  .transform((entry, ctx) => {
    if (!isValidSpec(entry.class, entry.spec)) {
      ctx.addIssue({
        code: 'custom',
        path: ['spec'],
        message: `${entry.spec} is not a ${CLASS_INFO[entry.class].label} specialization`,
      });
      return z.NEVER;
    }
    return { ...entry, role: parseClassSpec(entry.class, entry.spec).role };
  });

export type RosterEntry = z.output<typeof RosterEntrySchema>;
