import { z } from 'zod';

// WoW character names: 2-12 letters (accents allowed), no digits, spaces or symbols.
const capitalise = (name: string) => name.charAt(0).toLocaleUpperCase() + name.slice(1).toLocaleLowerCase();

export const CharacterNameSchema = z
  .string()
  .trim()
  .regex(/^\p{L}{2,12}$/u, 'Character names are 2 to 12 letters')
  .transform(capitalise);

// Realm names include spaces, apostrophes, hyphens and parentheses ("Mal'Ganis", "Aggra (Português)").
export const RealmSchema = z
  .string()
  .trim()
  .regex(/^[\p{L}\p{N} '’()-]{2,40}$/u, 'Invalid realm name');
