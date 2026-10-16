import { prisma } from '../config/db.js';
import { ResponseStatus } from '@prisma/client';

export class ResponseService {
  async updateResponse(eventId: string, characterId: string, status: ResponseStatus, isConfirmed: boolean = false) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { isPublished: true },
    });

    if (event?.isPublished) {
      throw new Error('Event is locked: responses cannot be changed after publication');
    }

    return prisma.response.upsert({
      where: {
        eventId_characterId: { eventId, characterId },
      },
      update: { status, isConfirmed },
      create: {
        eventId,
        characterId,
        status,
        isConfirmed,
      },
    });
  }

  async bulkUpdateResponses(eventId: string, selections: { characterId: string; status: ResponseStatus; isConfirmed: boolean }[]) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { isPublished: true },
    });

    if (event?.isPublished) {
      throw new Error('Event is locked');
    }

    const updates = selections.map(s =>
      prisma.response.upsert({
        where: { eventId_characterId: { eventId, characterId: s.characterId } },
        update: { status: s.status, isConfirmed: s.isConfirmed },
        create: { eventId, characterId: s.characterId, status: s.status, isConfirmed: s.isConfirmed },
      })
    );

    return prisma.$transaction(updates);
  }
}
