import { NotFoundError } from '../lib/errors.js';
import { GroupRepository } from '../repositories/group.repository.js';

export class GroupService {
  private groupRepo = new GroupRepository();

  async createGroup(name: string, description?: string) {
    return this.groupRepo.create(name, description);
  }

  async getGroup(id: string) {
    const group = await this.groupRepo.findById(id);
    if (!group) throw new NotFoundError('Group not found');
    return group;
  }

  async listGroups() {
    return this.groupRepo.findAll();
  }

  async addMember(userId: string, groupId: string) {
    return this.groupRepo.addMember(userId, groupId);
  }

  async removeMember(userId: string, groupId: string) {
    return this.groupRepo.removeMember(userId, groupId);
  }

  async deleteGroup(id: string) {
    return this.groupRepo.deleteGroup(id);
  }
}
