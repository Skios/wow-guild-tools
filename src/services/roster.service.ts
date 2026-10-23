import type { Character } from '@prisma/client';
import { prisma } from '../config/db.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import type { RosterEntry } from '../validators/roster.validator.js';

type RosterRow = Character & { user: { username: string; nickname?: string | null } | null };

/** The nickname to show: the account's (characters inherit it), else the unclaimed slot's own. */
export const shownNickname = (character: { nickname: string | null; user?: { nickname?: string | null } | null }) =>
  character.user?.nickname ?? character.nickname;

export function toRosterDto(character: RosterRow) {
  const { user, userId, inRoster, isMain, ...rest } = character;
  void inRoster; void isMain;
  return { ...rest, nickname: shownNickname(character), claimed: userId !== null, username: user?.username ?? null };
}

const withOwner = { user: { select: { username: true, nickname: true } } } as const;

/** A claimed character's nickname belongs to its account: write it there, not on the character. */
async function splitNickname<T extends { nickname?: string | null | undefined }>(userId: string | null, entry: T) {
  if (!userId || entry.nickname === undefined) return entry;
  const { nickname, ...rest } = entry;
  await prisma.user.update({ where: { id: userId }, data: { nickname } });
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
}
