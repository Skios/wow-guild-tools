import { prisma } from '../config/db.js';

export class UserRepository {
  /** Finds or creates the person behind a chat account, refreshing their display name. */
  async upsertFromIdentity(platform: string, platformUserId: string, username: string) {
    const identity = await prisma.identity.upsert({
      where: { platform_platformUserId: { platform, platformUserId } },
      update: { user: { update: { username } } },
      create: { platform, platformUserId, user: { create: { username } } },
      include: { user: true },
    });
    return identity.user;
  }

  async getGroupMembers(groupId: string) {
    return prisma.groupMember.findMany({
      where: { groupId },
      include: { user: true },
    });
  }
}
