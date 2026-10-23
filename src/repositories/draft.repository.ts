import type { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';

export type DraftKind = 'late';
export const DRAFT_TTL_MS = 30 * 60_000;

// ponytail: expired rows are ignored, not purged; they are tiny and overwritten on the next chat.
// Add a pg_cron purge if the table ever grows.
/** A Map-like store of one kind of half-finished Telegram conversation, keyed by the chat user id. */
export function draftStore<T>(kind: DraftKind) {
  const where = (id: number) => ({ kind, platform: 'telegram', platformUserId: String(id) });

  return {
    async get(id: number): Promise<T | undefined> {
      const row = await prisma.chatDraft.findUnique({ where: { kind_platform_platformUserId: where(id) } });
      return row && row.expiresAt > new Date() ? (row.data as T) : undefined;
    },
    async set(id: number, value: T) {
      const data = value as Prisma.InputJsonValue;
      const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);
      await prisma.chatDraft.upsert({
        where: { kind_platform_platformUserId: where(id) },
        create: { ...where(id), data, expiresAt },
        update: { data, expiresAt },
      });
    },
    async delete(id: number) {
      await prisma.chatDraft.deleteMany({ where: where(id) });
    },
  };
}
