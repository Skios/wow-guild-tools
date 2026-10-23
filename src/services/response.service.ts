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

/**
 * A note belongs to an answer ("IN, but leaving early"): a different answer, by the player or an officer, starts
 * without it. Run in the same transaction as the write, so the check and the write see the same row.
 */
const clearNoteUnless = (eventId: string, characterId: string, status: ResponseStatus) =>
  prisma.response.updateMany({ where: { eventId, characterId, NOT: { status } }, data: { note: null } });

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
    const [, saved] = await prisma.$transaction([
      clearNoteUnless(eventId, characterId, status),
      prisma.response.upsert({
        where: { eventId_characterId: { eventId, characterId } },
        // A member changing their answer must not undo the officer's confirmation.
        update: { status, ...(isConfirmed !== undefined && { isConfirmed }), ...arrival },
        create: { eventId, characterId, status, isConfirmed: isConfirmed ?? false, arrivalTime: arrival.arrivalTime ?? null },
      }),
    ]);
    return saved;
  }

  async bulkUpdateResponses(
    eventId: string,
    selections: { characterId: string; status: ResponseStatus; isConfirmed: boolean; lateMinutes?: number | undefined }[],
  ) {
    const event = await this.openEvent(eventId);
    await requireApproved(selections.map(s => s.characterId));

    const updates = selections.flatMap(s => {
      const arrival = this.arrival(s.status, event.startTime, s.lateMinutes);
      return [clearNoteUnless(eventId, s.characterId, s.status), prisma.response.upsert({
        where: { eventId_characterId: { eventId, characterId: s.characterId } },
        update: { status: s.status, isConfirmed: s.isConfirmed, ...arrival },
        create: { eventId, characterId: s.characterId, status: s.status, isConfirmed: s.isConfirmed, arrivalTime: arrival.arrivalTime ?? null },
      })];
    });

    return prisma.$transaction(updates);
  }

  /** The player's note on their answer (e.g. "IN, but leaving 30 min early"). */
  async setNote(eventId: string, characterId: string, note: string) {
    await this.openEvent(eventId);
    await requireApproved([characterId]);
    const { count } = await prisma.response.updateMany({ where: { eventId, characterId }, data: { note } });
    if (count === 0) throw new NotFoundError('Answer first, then add a note');
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
