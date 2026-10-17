import { describe, expect, test } from 'vitest';
import { GroupIdParamsSchema, GroupSchema, MemberBodySchema, MemberParamsSchema } from './group.validator.js';

const uuid = '3f2b8c1e-8a4d-4c55-9d7e-1b2c3d4e5f60';

describe('GroupSchema', () => {
  test('trims the name and keeps an optional description', () => {
    expect(GroupSchema.parse({ name: '  Core Raiders ', description: 'Tuesday' })).toEqual({
      name: 'Core Raiders',
      description: 'Tuesday',
    });
  });

  test.each(['', '   ', 'a'.repeat(51)])('rejects the name %j', (name) => {
    expect(GroupSchema.safeParse({ name }).success).toBe(false);
  });

  test('limits: 50 characters for the name, 500 for the description', () => {
    expect(GroupSchema.safeParse({ name: 'a'.repeat(50) }).success).toBe(true);
    expect(GroupSchema.safeParse({ name: 'ok', description: 'a'.repeat(500) }).success).toBe(true);
    expect(GroupSchema.safeParse({ name: 'ok', description: 'a'.repeat(501) }).success).toBe(false);
  });

  test.each([undefined, null, 1, {}, []])('rejects the non-string name %j', (name) => {
    expect(GroupSchema.safeParse({ name }).success).toBe(false);
  });
});

describe('params and body', () => {
  test('group id must be a UUID', () => {
    expect(GroupIdParamsSchema.safeParse({ id: uuid }).success).toBe(true);
    expect(GroupIdParamsSchema.safeParse({ id: '../../etc/passwd' }).success).toBe(false);
  });

  test('member routes need two UUIDs', () => {
    expect(MemberParamsSchema.safeParse({ id: uuid, userId: uuid }).success).toBe(true);
    expect(MemberParamsSchema.safeParse({ id: uuid, userId: 'x' }).success).toBe(false);
    expect(MemberBodySchema.safeParse({ userId: uuid }).success).toBe(true);
    expect(MemberBodySchema.safeParse({}).success).toBe(false);
    expect(MemberBodySchema.safeParse(null).success).toBe(false);
  });
});
