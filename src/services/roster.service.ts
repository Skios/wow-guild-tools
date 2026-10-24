import type { Character } from '@prisma/client';
import { prisma } from '../config/db.js';
import { SEASON_START_KEY } from './settings.service.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import type { RosterEntry } from '../validators/roster.validator.js';

type RosterRow = Character & { user: { username: string; nickname?: string | null } | null };

/** The nickname to show: the account's (characters inherit it), else the unclaimed slot's own. */
export const shownNickname = (character: { nickname: string | null; user?: { nickname?: string | null } | null }) =>
  character.user?.nickname ?? character.nickname;

export function toRosterDto(character: RosterRow) {
  const { user, userId, inRoster, ...rest } = character;
  void inRoster;
  return { ...rest, nickname: shownNickname(character), claimed: userId !== null, username: user?.username ?? null };
}

const PENDING = { inRoster: false, userId: { not: null } } as const;
/** Events still open to answers: a character leaving the roster loses its answers there (history stays). */
const coming = () => ({ isPublished: false, startTime: { gt: new Date() } });

const withOwner = { user: { select: { username: true, nickname: true } } } as const;

/**
 * A claimed character's nickname belongs to its account: write it there, not on the character.
 * An empty one is ignored (the form leaves it blank for claimed characters): it must not wipe the account's.
 */
async function splitNickname<T extends { nickname?: string | null | undefined }>(userId: string | null, entry: T) {
  if (!userId) return entry;
  const { nickname, ...rest } = entry;
  if (nickname) await prisma.user.update({ where: { id: userId }, data: { nickname } });
  return rest;
}

/** After a player loses their main, their oldest other character becomes main. */
export async function promoteNextMain(userId: string, removedId: string) {
  const next = await prisma.character.findFirst({ where: { userId, id: { not: removedId } }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (next) await prisma.character.update({ where: { id: next.id }, data: { isMain: true } });
}

async function findInRoster(id: string) {
  const character = await prisma.character.findFirst({ where: { id, inRoster: true } });
  if (!character) throw new NotFoundError('Character is not in the roster');
  return character;
}

export class RosterService {
  async list() {
    const rows = await prisma.character.findMany({
      where: { inRoster: true },
      include: withOwner,
      orderBy: { name: 'asc' },
    });
    return rows.map(toRosterDto);
  }

  /** Adds a roster slot. A character a player already registered is promoted, keeping its owner. */
  async add(entry: RosterEntry) {
    const existing = await prisma.character.findUnique({
      where: { name_realm: { name: entry.name, realm: entry.realm } },
    });
    if (existing?.inRoster) throw new ConflictError('Character is already in the roster');

    if (existing) {
      const data = await splitNickname(existing.userId, {
        class: entry.class, spec: entry.spec, role: entry.role, offSpecs: entry.offSpecs, nickname: entry.nickname,
      });
      const promoted = await prisma.character.update({ where: { id: existing.id }, data: { inRoster: true, ...data }, include: withOwner });
      return { created: false, character: toRosterDto(promoted) };
    }

    const created = await prisma.character.create({
      data: { ...entry, userId: null, isMain: false, inRoster: true },
      include: withOwner,
    });
    return { created: true, character: toRosterDto(created) };
  }

  async update(id: string, entry: RosterEntry) {
    const character = await findInRoster(id);
    const data = await splitNickname(character.userId, entry);
    const updated = await prisma.character.update({ where: { id }, data, include: withOwner });
    return toRosterDto(updated);
  }

  /** An empty slot nobody answered for disappears; anything with an owner or history only leaves the roster. */
  async remove(id: string) {
    const character = await findInRoster(id);
    const answers = character.userId ? 1 : await prisma.response.count({ where: { characterId: id } });
    if (!character.userId && answers === 0) {
      await prisma.character.delete({ where: { id } });
    } else {
      await prisma.character.update({ where: { id }, data: { inRoster: false } });
    }
  }

  /** Roster names nobody has picked yet: what a new player chooses from. */
  async listUnclaimed() {
    return prisma.character.findMany({ where: { inRoster: true, userId: null }, orderBy: { name: 'asc' } });
  }

  /** A player takes a roster name. Atomic: of two players racing for it, exactly one wins. */
  async claim(characterId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      // It becomes the main only for a player who has none: claiming a second name keeps the current main.
      const hasMain = (await tx.character.count({ where: { userId, isMain: true } })) > 0;
      const taken = await tx.character.updateMany({
        where: { id: characterId, inRoster: true, userId: null },
        data: { userId, isMain: !hasMain },
      });
      if (taken.count === 0) throw new ConflictError('That name has already been claimed');
      return tx.character.findUnique({ where: { id: characterId } });
    });
  }

  /**
   * Officers give a character to an account (moving it from whoever had it; also one off the roster, e.g. a name
   * someone else took); null frees it.
   */
  async assign(id: string, userId: string | null) {
    if (userId === null) return this.release(id);
    const character = await prisma.character.findUnique({ where: { id } });
    if (!character) throw new NotFoundError('No such character');
    if (!(await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) throw new NotFoundError('No such account');
    const hasMain = await prisma.character.findFirst({ where: { userId, isMain: true, id: { not: id } }, select: { id: true } });
    const assigned = await prisma.character.update({ where: { id }, data: { userId, isMain: !hasMain }, include: withOwner });
    if (character.userId && character.userId !== userId && character.isMain) await promoteNextMain(character.userId, id);
    return toRosterDto(assigned);
  }

  async release(id: string) {
    const character = await findInRoster(id);
    if (!character.userId) throw new ConflictError('Nobody has claimed this character');
    const freed = await prisma.character.update({ where: { id }, data: { userId: null, isMain: false }, include: withOwner });
    return toRosterDto(freed);
  }

  /** Characters players added that wait for an officer's approval. */
  async pending() {
    const rows = await prisma.character.findMany({ where: PENDING, include: withOwner, orderBy: { name: 'asc' } });
    return rows.map(toRosterDto);
  }

  /**
   * Rejected = as if the player removed it: deleted, or only unlinked if it has history. Every write checks it is
   * still pending, so an approval landing meanwhile wins (404) instead of losing the character.
   */
  async reject(id: string) {
    const character = await prisma.character.findFirst({ where: { id, ...PENDING } });
    if (!character?.userId) throw new NotFoundError('No pending character');
    const { count: deleted } = await prisma.character.deleteMany({ where: { id, ...PENDING, responses: { none: {} } } });
    if (deleted === 0) {
      const { count } = await prisma.character.updateMany({ where: { id, ...PENDING }, data: { userId: null, isMain: false } });
      if (count === 0) throw new NotFoundError('No pending character');
    }
    if (character.isMain) await promoteNextMain(character.userId, id);
  }

  async approve(id: string) {
    const { count } = await prisma.character.updateMany({ where: { id, ...PENDING }, data: { inRoster: true } });
    if (count === 0) throw new NotFoundError('No pending character');
  }

  /** Off the roster but still the player's: it waits for approval again. Its answers to coming events go. */
  async revoke(id: string) {
    const { count } = await prisma.character.updateMany({ where: { id, inRoster: true, userId: { not: null } }, data: { inRoster: false } });
    if (count === 0) throw new NotFoundError('No approved character with an owner');
    await prisma.response.deleteMany({ where: { characterId: id, event: coming() } });
  }

  /** Starts the roster over: players' characters go back to pending, empty unclaimed slots disappear, history stays. */
  async newSeason() {
    const now = new Date().toISOString();
    const [, deleted, removed] = await prisma.$transaction([
      prisma.response.deleteMany({ where: { character: { inRoster: true }, event: coming() } }),
      prisma.character.deleteMany({ where: { inRoster: true, userId: null, responses: { none: {} } } }),
      prisma.character.updateMany({ where: { inRoster: true }, data: { inRoster: false } }),
      // The dashboard's "whole season" attendance counts from here.
      prisma.setting.upsert({ where: { key: SEASON_START_KEY }, create: { key: SEASON_START_KEY, value: now }, update: { value: now } }),
    ]);
    return { deleted: deleted.count, removed: removed.count };
  }
}
