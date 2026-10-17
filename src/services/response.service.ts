import { prisma } from '../config/db.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { ResponseStatus } from '@prisma/client';

export class EventLockedError extends ConflictError {
  constructor() {
    super('Event is locked: responses cannot be changed after publication');
  }
}

export class ResponseService {
  private async assertOpen(eventId: string) {
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { isPublished: true } });
    if (!event) throw new NotFoundError('Event not found');
    if (event.isPublished) throw new EventLockedError();
  }

  async updateResponse(eventId: string, characterId: string, status: ResponseStatus, isConfirmed?: boolean) {
    await this.assertOpen(eventId);

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
    await this.assertOpen(eventId);

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
