import { prisma } from '../config/db';
import { Character, WoWClass, WoWRole } from '@prisma/client';

export interface CharacterInput {
  userId: string;
  name: string;
  realm: string;
  class: WoWClass;
  role: WoWRole;
}

export class ProfileService {
  async addCharacter(data: CharacterInput) {
    return prisma.character.create({
      data: {
        ...data,
        isMain: false, // New characters are alts by default
      },
    });
  }

  async setMainCharacter(userId: string, characterId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.character.updateMany({
        where: { userId },
        data: { isMain: false },
      });

      return tx.character.update({
        where: { id: characterId },
        data: { isMain: true },
      });
    });
  }

  async getMyProfile(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      include: {
        characters: { orderBy: { isMain: 'desc' } },
      },
    });
  }
}
