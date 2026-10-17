import type { Character } from '@prisma/client';
import { prisma } from '../config/db.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import type { RosterEntry } from '../validators/roster.validator.js';

type RosterRow = Character & { user: { username: string } | null };

export function toRosterDto(character: RosterRow) {
  const { user, userId, inRoster, isMain, ...rest } = character;
  void inRoster; void isMain;
  return { ...rest, claimed: userId !== null, username: user?.username ?? null };
}

const withOwner = { user: { select: { username: true } } } as const;

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
      const promoted = await prisma.character.update({
        where: { id: existing.id },
        data: { inRoster: true, class: entry.class, spec: entry.spec, role: entry.role },
        include: withOwner,
      });
      return { created: false, character: toRosterDto(promoted) };
    }

    const created = await prisma.character.create({
      data: { ...entry, userId: null, isMain: false, inRoster: true },
      include: withOwner,
    });
    return { created: true, character: toRosterDto(created) };
  }

  async update(id: string, entry: RosterEntry) {
    await findInRoster(id);
    const updated = await prisma.character.update({ where: { id }, data: entry, include: withOwner });
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

  async release(id: string) {
    const character = await findInRoster(id);
    if (!character.userId) throw new ConflictError('Nobody has claimed this character');
    const freed = await prisma.character.update({ where: { id }, data: { userId: null, isMain: false }, include: withOwner });
    return toRosterDto(freed);
  }
}
