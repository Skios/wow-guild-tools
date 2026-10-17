import { prisma } from '../config/db.js';
import type { CreateEventInput } from '../validators/event.validator.js';

export class EventRepository {
  async create(data: CreateEventInput) {
    return prisma.event.create({
      data: {
        title: data.title,
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        ...(data.description !== undefined && { description: data.description }),
        createdBy: data.createdByUserId,
      },
    });
  }

  async findById(id: string) {
    return prisma.event.findUnique({
      where: { id },
      include: {
        responses: {
          include: { character: { include: { user: { select: { username: true } } } } },
        },
      },
    });
  }

  async findAll(limit: number, offset: number) {
    return prisma.event.findMany({
      take: limit,
      skip: offset,
      orderBy: { startTime: 'asc' },
      include: { responses: { select: { status: true, isConfirmed: true } } },
    });
  }
}
