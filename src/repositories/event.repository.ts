import { prisma } from '../config/db.js';
import { CreateEventInput } from '../validators/event.validator.js';

export class EventRepository {
  async create(data: CreateEventInput) {
    return prisma.event.create({
      data: {
        title: data.title,
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        description: data.description,
        createdBy: data.createdByUserId,
      },
    });
  }

  async findById(id: string) {
    return prisma.event.findUnique({
      where: { id },
      include: {
        responses: {
          include: { character: true },
        },
      },
    });
  }

  async findAll() {
    return prisma.event.findMany({
      orderBy: { startTime: 'asc' },
    });
  }
}
