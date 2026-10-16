import { prisma } from '../config/db.js';
import { ResponseStatus } from '@prisma/client';

export class EventLockedError extends Error {
  constructor() {
    super('Event is locked: responses cannot be changed after publication');
  }
}

export class ResponseService {
  async updateResponse(eventId: string, characterId: string, status: ResponseStatus, isConfirmed?: boolean) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { isPublished: true },
    });

    if (event?.isPublished) {
      throw new EventLockedError();
    }

    return prisma.response.upsert({
      where: {
        eventId_characterId: { eventId, characterId },
      },
      // A member changing their answer must not undo the officer's confirmation.
      update: { status, ...(isConfirmed !== undefined && { isConfirmed }) },
      create: { eventId, characterId, status, isConfirmed: isConfirmed ?? false },
    });
  }

  async bulkUpdateResponses(eventId: string, selections: { characterId: string; status: ResponseStatus; isConfirmed: boolean }[]) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { isPublished: true },
    });

    if (event?.isPublished) {
      throw new EventLockedError();
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
