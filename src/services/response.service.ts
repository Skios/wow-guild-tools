import { prisma } from '../config/db.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { ResponseStatus } from '@prisma/client';

export class EventLockedError extends ConflictError {
  constructor() {
    super('Event is locked: responses cannot be changed after publication');
  }
}

export class NotApprovedError extends ConflictError {
  constructor() {
    super('Only characters approved for the roster can answer events');
  }
}

/** Every character must be on the roster (approved by an officer) to answer. */
async function requireApproved(characterIds: string[]) {
  const ids = [...new Set(characterIds)];
  if ((await prisma.character.count({ where: { id: { in: ids }, inRoster: true } })) !== ids.length) throw new NotApprovedError();
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
    await requireApproved([characterId]);
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
    await requireApproved(selections.map(s => s.characterId));

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

  /**
   * The player answers with another of their characters: status, arrival and note move; an officer confirms again.
   * Upsert, so a double tap (or a target an officer already answered for) ends with one answer, not a conflict.
   */
  async moveResponse(eventId: string, fromCharacterId: string, toCharacterId: string) {
    await this.openEvent(eventId);
    await requireApproved([toCharacterId]);
    const answer = await prisma.response.findUnique({ where: { eventId_characterId: { eventId, characterId: fromCharacterId } } });
    if (!answer) throw new NotFoundError('No answer to move');
    const moved = { status: answer.status, arrivalTime: answer.arrivalTime, note: answer.note, isConfirmed: false };
    await prisma.$transaction([
      prisma.response.deleteMany({ where: { eventId, characterId: fromCharacterId } }),
      prisma.response.upsert({
        where: { eventId_characterId: { eventId, characterId: toCharacterId } },
        create: { eventId, characterId: toCharacterId, ...moved },
        update: moved,
      }),
    ]);
  }
}
