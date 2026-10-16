import { describe, expect, test } from 'vitest';
import { FinalizeRosterSchema } from './event.validator.js';

const characterId = '3f2b8c1e-8a4d-4c55-9d7e-1b2c3d4e5f60';

describe('FinalizeRosterSchema', () => {
  test('accepts Prisma ResponseStatus values', () => {
    const parsed = FinalizeRosterSchema.parse({
      selections: [{ characterId, status: 'BENCH', isConfirmed: false }],
    });
    expect(parsed.selections[0]?.status).toBe('BENCH');
  });

  test('rejects statuses that are not in the database enum', () => {
    expect(() =>
      FinalizeRosterSchema.parse({ selections: [{ characterId, status: 'confirmed', isConfirmed: true }] }),
    ).toThrow();
  });
});
