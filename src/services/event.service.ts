import type { Event, ResponseStatus } from '@prisma/client';
import { prisma } from '../config/db.js';
import { shownNickname } from './roster.service.js';
import { ROLE_ORDER } from '../domain/wow.js';
import { TelegramAdapter } from '../integrations/telegram/telegram.adapter.js';
import { AppError, ConflictError, NotFoundError } from '../lib/errors.js';
import { EventRepository } from '../repositories/event.repository.js';
import type { CreateEventInput } from '../validators/event.validator.js';
import { NotificationService } from './notification.service.js';
import { ResponseService } from './response.service.js';

export interface MessageResult {
  characterId: string;
  name: string | null;
  status: 'sent' | 'failed' | 'unreachable' | 'unclaimed' | 'unknown';
  error?: string;
}

export interface ResponseCounts {
  in: number;
  out: number;
  tentative: number;
  bench: number;
  late: number;
  confirmed: number;
  /** Roster members who have not answered yet. */
  noAnswer: number;
}

type ListedResponse = { status: ResponseStatus; isConfirmed: boolean; character: { inRoster: boolean } };

function countResponses(responses: ListedResponse[], rosterSize: number): ResponseCounts {
  const counts: ResponseCounts = { in: 0, out: 0, tentative: 0, bench: 0, late: 0, confirmed: 0, noAnswer: 0 };
  let rosterAnswers = 0;
  for (const { status, isConfirmed, character } of responses) {
    counts[status.toLowerCase() as 'in' | 'out' | 'tentative' | 'bench' | 'late'] += 1;
    if (isConfirmed) counts.confirmed += 1;
    if (character.inRoster) rosterAnswers += 1;
  }
  counts.noAnswer = Math.max(0, rosterSize - rosterAnswers);
  return counts;
}

type RosterRow = { status: ResponseStatus; isConfirmed: boolean; character: { name: string; role: keyof typeof ROLE_ORDER } };

const attending = (status: ResponseStatus) => status === 'IN' || status === 'LATE';

function buildRoster(rows: RosterRow[]) {
  const byRoleThenName = (a: RosterRow, b: RosterRow) =>
    ROLE_ORDER[a.character.role] - ROLE_ORDER[b.character.role] || a.character.name.localeCompare(b.character.name);
  const names = (list: RosterRow[]) => [...list].sort(byRoleThenName).map(r => r.character.name);

  return {
    team: names(rows.filter(r => attending(r.status) && r.isConfirmed)),
    bench: names(rows.filter(r => r.status === 'BENCH' || (attending(r.status) && !r.isConfirmed))),
  };
}

export class EventService {
  private eventRepo = new EventRepository();
  private responseService = new ResponseService();
  private notificationService = new NotificationService();

  constructor() {
    this.notificationService.registerAdapter(new TelegramAdapter());
  }

  async createEvent(data: CreateEventInput) {
    if (Date.parse(data.endTime) <= Date.parse(data.startTime)) {
      throw new AppError('Event end time must be after start time', 400);
    }
    if (data.createdByUserId) {
      const creator = await prisma.user.findUnique({ where: { id: data.createdByUserId }, select: { id: true } });
      if (!creator) throw new NotFoundError('User not found');
    }

    const event = await this.eventRepo.create(data);

    // Fire and forget: the event exists even if the channel is down.
    this.notificationService
      .notifyEventCreated({
        eventId: event.id,
        eventTitle: event.title,
        startTime: event.startTime,
        description: event.description,
      })
      .catch(err => console.error('Notification failed:', err));

    return event;
  }

  async finalizeRoster(eventId: string, selections: { characterId: string; status: ResponseStatus; isConfirmed: boolean; lateMinutes?: number | undefined }[]) {
    return this.responseService.bulkUpdateResponses(eventId, selections);
  }

  async publishEvent(eventId: string) {
    const event = await this.getEvent(eventId);

    // Claim the lock atomically so a second publish cannot post twice.
    const claimed = await prisma.event.updateMany({
      where: { id: eventId, isPublished: false },
      data: { isPublished: true },
    });
    if (claimed.count === 0) throw new ConflictError('Event already published');

    try {
      const responses = await prisma.response.findMany({ where: { eventId }, include: { character: true } });
      const roster = buildRoster(responses);
      if (roster.team.length === 0) throw new ConflictError('Confirm at least one player before publishing');

      const channels = await this.notificationService.publishFinalRoster({
        eventId: event.id,
        eventTitle: event.title,
        startTime: event.startTime,
        description: event.description,
        roster,
      });
      if (!channels.some(c => c.success)) throw new AppError('Publication failed on every channel', 502);

      return { published: true, channels };
    } catch (error) {
      // Nothing reached the channel: let the officers fix the roster and retry.
      await prisma.event.updateMany({ where: { id: eventId }, data: { isPublished: false } });
      throw error;
    }
  }

  /** Privately reminds people who have not answered. Each person gets their own delivery result. */
  async messageCharacters(eventId: string, characterIds: string[], customText?: string) {
    const event = await this.getEvent(eventId);
    if (event.isPublished) throw new ConflictError('Event already published');

    const text = customText ?? `Reminder: ${event.title} on ${event.startTime.toLocaleString()}. Are you coming?`;
    const found = await prisma.character.findMany({
      where: { id: { in: characterIds }, OR: [{ inRoster: true }, { responses: { some: { eventId } } }] },
      include: { user: { select: { identities: { where: { platform: 'telegram' }, select: { platformUserId: true } } } } },
    });
    const byId = new Map(found.map(c => [c.id, c]));

    const results: MessageResult[] = [];
    for (const characterId of characterIds) {
      const character = byId.get(characterId);
      if (!character) { results.push({ characterId, name: null, status: 'unknown' }); continue; }
      const base = { characterId, name: character.name };
      if (!character.user) { results.push({ ...base, status: 'unclaimed' }); continue; }
      const telegramId = character.user.identities[0]?.platformUserId;
      if (!telegramId) { results.push({ ...base, status: 'unreachable' }); continue; }

      const sent = await this.notificationService.sendDirect('telegram', telegramId, { text, eventId });
      results.push(sent.success ? { ...base, status: 'sent' } : { ...base, status: 'failed', error: sent.error ?? 'Delivery failed' });
    }
    return results;
  }

  async getEvent(id: string) {
    const event = await this.eventRepo.findById(id);
    if (!event) throw new NotFoundError('Event not found');
    return event;
  }

  /** The event with its answers, plus the roster members who have not answered (and whether the bot can write to them). */
  async getEventDetail(id: string) {
    const event = await this.getEvent(id);
    const missing = await prisma.character.findMany({
      where: { inRoster: true, responses: { none: { eventId: id } } },
      include: { user: { select: { username: true, nickname: true, identities: { where: { platform: 'telegram' }, select: { id: true } } } } },
      orderBy: { name: 'asc' },
    });
    const noAnswer = missing.map(({ user, userId, inRoster, isMain, createdAt, updatedAt, ...character }) => {
      void userId; void inRoster; void isMain; void createdAt; void updatedAt;
      return {
        ...character, nickname: shownNickname({ ...character, user }),
        username: user?.username ?? null, reachable: (user?.identities.length ?? 0) > 0,
      };
    });
    const responses = event.responses.map(r => ({ ...r, character: { ...r.character, nickname: shownNickname(r.character) } }));
    return { ...event, responses, noAnswer };
  }

  async listEvents(limit: number = 20, offset: number = 0) {
    const [events, rosterSize] = await Promise.all([
      this.eventRepo.findAll(limit, offset),
      prisma.character.count({ where: { inRoster: true } }),
    ]);
    return events.map(({ responses, ...event }: Event & { responses: ListedResponse[] }) => ({
      ...event,
      counts: countResponses(responses, rosterSize),
    }));
  }
}
