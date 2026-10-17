import { prisma } from '../config/db.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { ResponseStatus } from '@prisma/client';

export class EventLockedError extends ConflictError {
  constructor() {
    super('Event is locked: responses cannot be changed after publication');
  }
}

export class ResponseService {
  private async openEvent(eventId: string) {
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { isPublished: true, startTime: true } });
    if (!event) throw new NotFoundError('Event not found');
    if (event.isPublished) throw new EventLockedError();
    return event;
  }

  /** LATE stores event start + minutes; any other status forgets a previous arrival time. */
  private arrival(status: ResponseStatus, startTime: Date, lateMinutes: number | undefined): { arrivalTime?: Date | null } {
    if (status !== 'LATE') return { arrivalTime: null };
    if (lateMinutes === undefined) return {};
    return { arrivalTime: new Date(startTime.getTime() + lateMinutes * 60_000) };
  }

  async updateResponse(eventId: string, characterId: string, status: ResponseStatus, isConfirmed?: boolean, lateMinutes?: number) {
    const event = await this.openEvent(eventId);
    const arrival = this.arrival(status, event.startTime, lateMinutes);

    return prisma.response.upsert({
      where: {
        eventId_characterId: { eventId, characterId },
      },
      // A member changing their answer must not undo the officer's confirmation.
      update: { status, ...(isConfirmed !== undefined && { isConfirmed }), ...arrival },
      create: { eventId, characterId, status, isConfirmed: isConfirmed ?? false, arrivalTime: arrival.arrivalTime ?? null },
    });
  }

  async bulkUpdateResponses(
    eventId: string,
    selections: { characterId: string; status: ResponseStatus; isConfirmed: boolean; lateMinutes?: number | undefined }[],
  ) {
    const event = await this.openEvent(eventId);

    const updates = selections.map(s => {
      const arrival = this.arrival(s.status, event.startTime, s.lateMinutes);
      return prisma.response.upsert({
        where: { eventId_characterId: { eventId, characterId: s.characterId } },
        update: { status: s.status, isConfirmed: s.isConfirmed, ...arrival },
        create: { eventId, characterId: s.characterId, status: s.status, isConfirmed: s.isConfirmed, arrivalTime: arrival.arrivalTime ?? null },
      });
    });

    return prisma.$transaction(updates);
  }
}
