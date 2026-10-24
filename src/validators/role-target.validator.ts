import { z } from 'zod';

// How many of each role an event aims for. Flex grows with the confirmed count; fixed is a set raid.
const count = (max: number) => z.number().int().min(0).max(max);

const FlexSchema = z.object({
  mode: z.literal('flex'),
  tanks: count(10),
  /** Healers for every 5 people, in halves (1.5 = 3 healers in 10). */
  healersPer5: z.number().min(0).max(5).multipleOf(0.5),
  /** Share of the DPS that is melee, in percent; the rest is ranged. */
  meleeShare: count(100),
});

const FixedSchema = z.object({
  mode: z.literal('fixed'),
  size: z.number().int().min(1).max(40),
  tanks: count(40),
  healers: count(40),
  melee: count(40),
  ranged: count(40),
}).refine(t => t.melee + t.ranged === t.size - t.tanks - t.healers, {
  message: 'Melee and ranged must add up to the raid size minus tanks and healers',
});

export const RoleTargetSchema = z.discriminatedUnion('mode', [FlexSchema, FixedSchema]);
export type RoleTarget = z.infer<typeof RoleTargetSchema>;

export const DEFAULT_ROLE_TARGET: RoleTarget = { mode: 'flex', tanks: 2, healersPer5: 1, meleeShare: 50 };

/** Body of the routes that set a target; null = back to the guild default (event only). */
export const SetRoleTargetSchema = z.object({ target: RoleTargetSchema.nullable() });
export const SetDefaultRoleTargetSchema = z.object({ target: RoleTargetSchema });
