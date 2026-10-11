import { prisma } from '../config/db';

export class UserRepository {
  async findByPlatformId(platformId: string) {
    return prisma.user.findUnique({
      where: { platformId },
    });
  }

  async createFromPlatform(platformId: string, username: string) {
    return prisma.user.upsert({
      where: { platformId },
      update: { username },
      create: {
        platformId,
        username,
      },
    });
  }

  async getGroupMembers(groupId: string) {
    return prisma.groupMember.findMany({
      where: { groupId },
      include: { user: true },
    });
  }
}
