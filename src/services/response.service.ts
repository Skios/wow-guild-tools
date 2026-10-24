import { prisma } from '../config/db.js';
import { AppError, ConflictError, NotFoundError } from '../lib/errors.js';
import { ResponseStatus } from '@prisma/client';

export class EventLockedError extends ConflictError {
  constructor(message = 'Sign-ups are closed for this event') {
    super(message);
  }
}

/** A kind of closed: everywhere a closed event is handled (bot buttons, follow-ups), so is a cancelled one. */
export class EventCanceledError extends EventLockedError {
  constructor() {
    super('This event is cancelled');
  }
}

/** Players answer only while sign-ups are open; officers fix the board until the event is cancelled. */
export type Actor = 'player' | 'officer';

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

/**
 * The spec each selection plays, for the ones that say: an off-spec of the character, or null for its main.
 * Anything else is refused before writing.
 */
async function playedSpecs(selections: { characterId: string; spec?: string | null | undefined }[]) {
  const asked = selections.filter(s => s.spec !== undefined);
  const result = new Map<string, string | null>();
  if (asked.length === 0) return result;
  const characters = await prisma.character.findMany({
    where: { id: { in: asked.map(s => s.characterId) } }, select: { id: true, name: true, spec: true, offSpecs: true },
  });
  for (const { characterId, spec } of asked) {
    const character = characters.find(c => c.id === characterId);
    if (spec === null || spec === character?.spec) { result.set(characterId, null); continue; }
    if (!character?.offSpecs.includes(spec!)) throw new AppError(`${character?.name ?? 'That character'} has no such off-spec`, 400);
    result.set(characterId, spec!);
  }
  return result;
}

export class ResponseService {
  private async openEvent(eventId: string, actor: Actor = 'player') {
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { isPublished: true, canceledAt: true, startTime: true } });
    if (!event) throw new NotFoundError('Event not found');
    if (event.canceledAt) throw new EventCanceledError();
    if (actor === 'player' && (event.isPublished || event.startTime <= new Date())) throw new EventLockedError();
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
    selections: { characterId: string; status: ResponseStatus; isConfirmed: boolean; lateMinutes?: number | undefined; spec?: string | null | undefined }[],
  ) {
    const event = await this.openEvent(eventId, 'officer');
    await requireApproved(selections.map(s => s.characterId));
    const specs = await playedSpecs(selections);

    const updates = selections.flatMap(s => {
      const arrival = this.arrival(s.status, event.startTime, s.lateMinutes);
      const spec = specs.has(s.characterId) ? { spec: specs.get(s.characterId)! } : {};
      return [clearNoteUnless(eventId, s.characterId, s.status), prisma.response.upsert({
        where: { eventId_characterId: { eventId, characterId: s.characterId } },
        update: { status: s.status, isConfirmed: s.isConfirmed, ...arrival, ...spec },
        create: { eventId, characterId: s.characterId, status: s.status, isConfirmed: s.isConfirmed, arrivalTime: arrival.arrivalTime ?? null, ...spec },
      })];
    });

    return prisma.$transaction(updates);
  }

  /** The player's note on their answer (e.g. "IN, but leaving 30 min early"). */
  async setNote(eventId: string, characterId: string, note: string | null) {
    await this.openEvent(eventId);
    await requireApproved([characterId]);
    const { count } = await prisma.response.updateMany({ where: { eventId, characterId }, data: { note } });
    if (count === 0) throw new NotFoundError('Answer first, then add a note');
  }

  /**
   * The player answers with another of their characters: status, arrival and note move; an officer confirms again.
   * Upsert, so a double tap (or a target an officer already answered for) ends with one answer, not a conflict.
   */
  async moveResponse(eventId: string, fromCharacterId: string, toCharacterId: string, { keepConfirmed = false, actor = 'player' as Actor } = {}) {
    await this.openEvent(eventId, actor);
    await requireApproved([toCharacterId]);
    const answer = await prisma.response.findUnique({ where: { eventId_characterId: { eventId, characterId: fromCharacterId } } });
    if (!answer) throw new NotFoundError('No answer to move');
    // The spec played was the old character's; the new one plays its main until an officer says otherwise.
    // An officer's switch remembers what the player answered with (to tell them at publish); theirs forgets it.
    const original = answer.switchedFrom ?? fromCharacterId;
    const switchedFrom = actor === 'officer' && original !== toCharacterId ? original : null;
    const moved = {
      status: answer.status, arrivalTime: answer.arrivalTime, note: answer.note, isConfirmed: keepConfirmed && answer.isConfirmed,
      spec: null, switchedFrom, toldAssignment: answer.toldAssignment ?? null,
    };
    await prisma.$transaction([
      prisma.response.deleteMany({ where: { eventId, characterId: fromCharacterId } }),
      prisma.response.upsert({
        where: { eventId_characterId: { eventId, characterId: toCharacterId } },
        create: { eventId, characterId: toCharacterId, ...moved },
        update: moved,
      }),
    ]);
  }

  /** An officer swaps which of a player's approved characters comes (alt -> main to fill a role). Confirmation kept. */
  async switchCharacter(eventId: string, fromCharacterId: string, toCharacterId: string) {
    const owners = await prisma.character.findMany({ where: { id: { in: [fromCharacterId, toCharacterId] } }, select: { id: true, userId: true } });
    const [from, to] = [fromCharacterId, toCharacterId].map(id => owners.find(c => c.id === id)?.userId);
    if (!from || from !== to) throw new AppError("Both characters must belong to the same player", 400);
    // Unlike the player's own double tap, an officer never overwrites an answer the target already has.
    const taken = await prisma.response.findUnique({ where: { eventId_characterId: { eventId, characterId: toCharacterId } }, select: { id: true } });
    if (taken) throw new ConflictError('That character has already answered for this event');
    // ponytail: read-then-move outside one transaction; a concurrent edit of the same answer can be lost. Fine at guild scale.
    await this.moveResponse(eventId, fromCharacterId, toCharacterId, { keepConfirmed: true, actor: 'officer' });
  }
}
