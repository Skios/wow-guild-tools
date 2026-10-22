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
    // The other specs this character can play, in order of preference (2nd, 3rd...).
    offSpecs: z.array(z.string()).default([]),
    // What the guild calls the player behind it; the same nickname groups someone's characters.
    nickname: z
      .string()
      .trim()
      .max(24, 'Nicknames are at most 24 characters')
      .regex(/^[\p{L}\p{N} ._'-]*$/u, 'Nicknames use letters, digits, spaces and . _ \' -')
      .nullish()
      .transform(value => value || null),
  })
  .transform((entry, ctx) => {
    const label = CLASS_INFO[entry.class].label;
    if (!isValidSpec(entry.class, entry.spec)) {
      ctx.addIssue({ code: 'custom', path: ['spec'], message: `${entry.spec} is not a ${label} specialization` });
      return z.NEVER;
    }
    const bad = entry.offSpecs.find(off => !isValidSpec(entry.class, off) || off === entry.spec);
    if (bad !== undefined || new Set(entry.offSpecs).size !== entry.offSpecs.length) {
      const message = bad === entry.spec ? 'The main spec cannot also be an offspec'
        : bad !== undefined ? `${bad} is not a ${label} specialization` : 'Each offspec can appear only once';
      ctx.addIssue({ code: 'custom', path: ['offSpecs'], message });
      return z.NEVER;
    }
    return { ...entry, role: parseClassSpec(entry.class, entry.spec).role };
  });

export type RosterEntry = z.output<typeof RosterEntrySchema>;
