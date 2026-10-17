import { prisma } from '../config/db.js';
import { NotFoundError } from '../lib/errors.js';
import type { CharacterInput } from '../validators/character.validator.js';

export class ProfileService {
  async addCharacter(data: CharacterInput) {
    const user = await prisma.user.findUnique({ where: { id: data.userId }, select: { id: true } });
    if (!user) throw new NotFoundError('User not found');

    return prisma.character.create({
      data: {
        ...data,
        isMain: false, // New characters are alts by default
      },
    });
  }

  async setMainCharacter(userId: string, characterId: string) {
    return prisma.$transaction(async (tx) => {
      // A user can only promote one of their own characters.
      const owned = await tx.character.findFirst({ where: { id: characterId, userId } });
      if (!owned) throw new NotFoundError('Character not found');

      await tx.character.updateMany({ where: { userId }, data: { isMain: false } });
      return tx.character.update({ where: { id: characterId }, data: { isMain: true } });
    });
  }

  async getMyProfile(userId: string) {
    const profile = await prisma.user.findUnique({
      where: { id: userId },
      include: { characters: { orderBy: { isMain: 'desc' } } },
    });
    if (!profile) throw new NotFoundError('User not found');
    return profile;
  }
}
