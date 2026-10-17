import { WoWClass, WoWRole } from '@prisma/client';
import { z } from 'zod';
import { isValidRole, CLASS_INFO, ROLE_LABEL } from '../domain/wow.js';

// WoW character names: 2-12 letters (accents allowed), no digits, spaces or symbols.
export const CharacterNameSchema = z.string().trim().regex(/^\p{L}{2,12}$/u, 'Character names are 2 to 12 letters');

// Realm names include spaces, apostrophes, hyphens and parentheses ("Mal'Ganis", "Aggra (Português)").
export const RealmSchema = z
  .string()
  .trim()
  .regex(/^[\p{L}\p{N} '’()-]{2,40}$/u, 'Invalid realm name');

export const SetMainSchema = z.object({ userId: z.string().uuid('Invalid user ID') });

export const CharacterSchema = z
  .object({
    userId: z.string().uuid('Invalid user ID'),
    name: CharacterNameSchema,
    realm: RealmSchema,
    class: z.enum(WoWClass),
    role: z.enum(WoWRole),
  })
  .superRefine((c, ctx) => {
    if (!isValidRole(c.class, c.role)) {
      ctx.addIssue({
        code: 'custom',
        path: ['role'],
        message: `${CLASS_INFO[c.class].label} cannot play ${ROLE_LABEL[c.role]}`,
      });
    }
  });

export type CharacterInput = z.infer<typeof CharacterSchema>;
