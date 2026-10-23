import { z } from 'zod';
import { prisma } from '../config/db.js';
import { isValidSpec, parseClassSpec } from '../domain/wow.js';
import { AppError, ConflictError, NotFoundError } from '../lib/errors.js';
import { RosterEntrySchema } from '../validators/roster.validator.js';
import { promoteNextMain, RosterService } from './roster.service.js';

const NicknameSchema = RosterEntrySchema.in.shape.nickname;
const SpecsSchema = z.object({ spec: z.string().min(1), offSpecs: z.array(z.string()).max(3).default([]) });
const CHARACTER_FIELDS = { id: true, name: true, realm: true, class: true, spec: true, role: true, offSpecs: true, isMain: true, inRoster: true } as const;
const roster = new RosterService();
const MAX_CHARACTERS = 20;


/** The signed-in player's own profile and characters. Every method only touches the caller's data. */
export class MeService {
  async profile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true, nickname: true, preferredChannel: true, role: { select: { name: true } },
        identities: { where: { platform: { not: 'supabase' } }, select: { platform: true } },
        characters: { select: CHARACTER_FIELDS, orderBy: [{ isMain: 'desc' }, { name: 'asc' }] },
      },
    });
    if (!user) throw new NotFoundError('Account not found');
    const { identities, role, ...rest } = user;
    return { ...rest, role: role?.name ?? null, channels: { telegram: identities.some(i => i.platform === 'telegram') } };
  }

  async setNickname(userId: string, raw: unknown) {
    const nickname = NicknameSchema.parse(raw);
    await prisma.user.update({ where: { id: userId }, data: { nickname } });
  }

  /** Roster names nobody has claimed yet. */
  async claimable() {
    return prisma.character.findMany({
      where: { inRoster: true, userId: null }, select: { id: true, name: true, realm: true, class: true, spec: true }, orderBy: { name: 'asc' },
    });
  }

  claim(userId: string, characterId: string) {
    return roster.claim(characterId, userId);
  }

  /** A new character: out of the roster until an officer approves it. The first one becomes the main. */
  async addCharacter(userId: string, input: unknown) {
    const { name, realm, class: cls, spec, role, offSpecs } = RosterEntrySchema.parse({ ...(input as object), nickname: null });
    const existing = await prisma.character.findUnique({ where: { name_realm: { name, realm } } });
    if (existing?.userId === userId) throw new ConflictError(`You already have ${name}`);
    if (existing?.userId === null && existing.inRoster) throw new ConflictError(`${name} is on the roster: claim it instead`);
    if (existing && existing.userId !== null) throw new ConflictError(`${name}-${realm} already belongs to another player`);
    const owned = await prisma.character.count({ where: { userId } });
    if (owned >= MAX_CHARACTERS) throw new ConflictError(`At most ${MAX_CHARACTERS} characters per account`);
    const isMain = owned === 0;
    // An unowned character off the roster (released earlier) is taken back, keeping its history.
    if (existing) return prisma.character.update({ where: { id: existing.id }, data: { spec, role, offSpecs, class: cls, userId, isMain } });
    return prisma.character.create({ data: { name, realm, class: cls, spec, role, offSpecs, userId, inRoster: false, isMain } });
  }

  async updateCharacter(userId: string, id: string, input: unknown) {
    const character = await this.mine(userId, id);
    const { spec, offSpecs } = SpecsSchema.parse(input);
    const bad = [spec, ...offSpecs].find(s => !isValidSpec(character.class, s));
    if (bad) throw new AppError(`${bad} is not a specialization of this class`, 400);
    if (offSpecs.includes(spec) || new Set(offSpecs).size !== offSpecs.length) throw new AppError('Each spec can appear only once', 400);
    await prisma.character.update({ where: { id }, data: { spec, role: parseClassSpec(character.class, spec).role, offSpecs } });
  }

  async setMain(userId: string, id: string) {
    await this.mine(userId, id);
    await prisma.$transaction([
      prisma.character.updateMany({ where: { userId, isMain: true }, data: { isMain: false } }),
      prisma.character.update({ where: { id }, data: { isMain: true } }),
    ]);
  }

  /** A roster character, or one with answers, is released (stays for the guild); a fresh one is deleted. */
  async removeCharacter(userId: string, id: string) {
    const character = await this.mine(userId, id);
    if (character.inRoster || (await prisma.response.count({ where: { characterId: id } })) > 0) {
      await prisma.character.update({ where: { id }, data: { userId: null, isMain: false } });
    } else {
      await prisma.character.delete({ where: { id } });
    }
    if (character.isMain) await promoteNextMain(userId, id);
  }

  private async mine(userId: string, id: string) {
    const character = await prisma.character.findFirst({ where: { id, userId } });
    if (!character) throw new NotFoundError('Character not found');
    return character;
  }
}
