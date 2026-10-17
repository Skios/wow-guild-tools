import type { Event, ResponseStatus } from '@prisma/client';
import { prisma } from '../config/db.js';
import { ROLE_ORDER } from '../domain/wow.js';
import { TelegramAdapter } from '../integrations/telegram/telegram.adapter.js';
import { AppError, ConflictError, NotFoundError } from '../lib/errors.js';
import { EventRepository } from '../repositories/event.repository.js';
import type { CreateEventInput } from '../validators/event.validator.js';
import { NotificationService } from './notification.service.js';
import { ResponseService } from './response.service.js';

export interface ResponseCounts {
  in: number;
  out: number;
  tentative: number;
  bench: number;
  confirmed: number;
}

function countResponses(responses: { status: ResponseStatus; isConfirmed: boolean }[]): ResponseCounts {
  const counts: ResponseCounts = { in: 0, out: 0, tentative: 0, bench: 0, confirmed: 0 };
  for (const { status, isConfirmed } of responses) {
    counts[status.toLowerCase() as 'in' | 'out' | 'tentative' | 'bench'] += 1;
    if (isConfirmed) counts.confirmed += 1;
  }
  return counts;
}

type RosterRow = { status: ResponseStatus; isConfirmed: boolean; character: { name: string; role: keyof typeof ROLE_ORDER } };

function buildRoster(rows: RosterRow[]) {
  const byRoleThenName = (a: RosterRow, b: RosterRow) =>
    ROLE_ORDER[a.character.role] - ROLE_ORDER[b.character.role] || a.character.name.localeCompare(b.character.name);
  const names = (list: RosterRow[]) => [...list].sort(byRoleThenName).map(r => r.character.name);

  return {
    team: names(rows.filter(r => r.status === 'IN' && r.isConfirmed)),
    bench: names(rows.filter(r => r.status === 'BENCH' || (r.status === 'IN' && !r.isConfirmed))),
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
      throw new Error('Event end time must be after start time');
    }
    const creator = await prisma.user.findUnique({ where: { id: data.createdByUserId }, select: { id: true } });
    if (!creator) throw new NotFoundError('User not found');

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

  async finalizeRoster(eventId: string, selections: { characterId: string, status: ResponseStatus, isConfirmed: boolean }[]) {
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

  async getEvent(id: string) {
    const event = await this.eventRepo.findById(id);
    if (!event) throw new NotFoundError('Event not found');
    return event;
  }

  async listEvents(limit: number = 20, offset: number = 0) {
    const events = await this.eventRepo.findAll(limit, offset);
    return events.map(({ responses, ...event }: Event & { responses: { status: ResponseStatus; isConfirmed: boolean }[] }) => ({
      ...event,
      counts: countResponses(responses),
    }));
  }
}
