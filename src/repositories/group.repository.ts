import { prisma } from '../config/db.js';

export class GroupRepository {
  async create(name: string, description?: string) {
    return prisma.rosterGroup.create({
      data: { name, description: description ?? null },
    });
  }

  async findById(id: string) {
    return prisma.rosterGroup.findUnique({
      where: { id },
      include: { members: { include: { user: true } } },
    });
  }

  async findAll() {
    return prisma.rosterGroup.findMany();
  }

  async addMember(userId: string, groupId: string) {
    return prisma.groupMember.upsert({
      where: {
        userId_groupId: { userId, groupId },
      },
      update: {},
      create: { userId, groupId },
    });
  }

  async removeMember(userId: string, groupId: string) {
    return prisma.groupMember.delete({
      where: {
        userId_groupId: { userId, groupId },
      },
    });
  }

  async deleteGroup(id: string) {
    return prisma.rosterGroup.delete({
      where: { id },
    });
  }
}
