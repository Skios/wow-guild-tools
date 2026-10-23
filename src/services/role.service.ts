import { prisma } from '../config/db.js';
import { isKnownCapability, roleChangeProblem } from '../domain/roles.js';
import { AppError, ConflictError, NotFoundError } from '../lib/errors.js';
import type { Officer } from '../plugins/auth.js';
import { RoleInputSchema } from '../validators/role.validator.js';

const FIELDS = { id: true, name: true, position: true, capabilities: true, isDefault: true, isOwner: true } as const;

function parseRole(input: unknown) {
  const role = RoleInputSchema.parse(input);
  const unknown = role.capabilities.find(c => !isKnownCapability(c));
  if (unknown) throw new AppError(`Unknown capability: ${unknown}`, 400);
  return role;
}

export class RoleService {
  async list() {
    const roles = await prisma.role.findMany({
      select: { ...FIELDS, _count: { select: { users: true } } },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    return roles.map(({ _count, ...role }) => ({ ...role, users: _count.users }));
  }

  async create(input: unknown) {
    return prisma.role.create({ data: parseRole(input) });
  }

  async update(id: string, input: unknown) {
    const data = parseRole(input);
    if ((await this.find(id)).isOwner) throw new ConflictError('The Owner role cannot be changed');
    return prisma.role.update({ where: { id }, data });
  }

  async remove(id: string) {
    const role = await prisma.role.findUnique({ where: { id }, select: { ...FIELDS, _count: { select: { users: true } } } });
    if (!role) throw new NotFoundError('No such role');
    if (role.isOwner) throw new ConflictError('The Owner role cannot be deleted');
    if (role.isDefault) throw new ConflictError('New accounts get this role: it cannot be deleted');
    if (role._count.users > 0) throw new ConflictError(`${role._count.users} accounts have this role: give them another one first`);
    await prisma.role.delete({ where: { id } });
  }

  // ponytail: two Owners demoting each other at the same instant could leave none; `npm run officer -- create`
  // makes a new Owner. Not worth a lock for a guild with one or two Owners.
  async assign(actor: Officer, userId: string, roleId: string) {
    const [target, next] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: { select: FIELDS } } }),
      prisma.role.findUnique({ where: { id: roleId }, select: FIELDS }),
    ]);
    if (!target) throw new NotFoundError('No such user');
    if (!next) throw new NotFoundError('No such role');

    const actorRole = { name: actor.role, position: actor.position, isOwner: actor.isOwner, capabilities: actor.capabilities };
    const problem = roleChangeProblem({ userId: actor.userId, role: actorRole }, { userId: target.id, role: target.role }, next);
    if (problem) throw new AppError(problem, 403);

    await prisma.user.update({ where: { id: userId }, data: { roleId } });
  }

  private async find(id: string) {
    const role = await prisma.role.findUnique({ where: { id }, select: FIELDS });
    if (!role) throw new NotFoundError('No such role');
    return role;
  }
}
