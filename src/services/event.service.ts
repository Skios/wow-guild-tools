import { EventRepository } from '../repositories/event.repository.js';
import type { CreateEventInput } from '../validators/event.validator.js';
import { NotificationService } from './notification.service.js';
import { TelegramAdapter } from '../integrations/telegram/telegram.adapter.js';
import { ResponseService } from './response.service.js';
import { ResponseStatus } from '@prisma/client';
import { prisma } from '../config/db.js';

export class EventService {
  private eventRepo = new EventRepository();
  private responseService = new ResponseService();
  private notificationService = new NotificationService();

  constructor() {
    this.notificationService.registerAdapter(new TelegramAdapter());
  }

  async createEvent(data: CreateEventInput) {
    if (new Date(data.endTime) <= new Date(data.startTime)) {
      throw new Error('Event end time must be after start time');
    }

    const event = await this.eventRepo.create(data);

    // Trigger Notification (Fire and forget)
    this.notificationService.notifyEventCreated({
      eventId: event.id,
      eventTitle: event.title,
      startTime: event.startTime,
      description: event.description,
    }).catch(err => console.error('Notification failed:', err));

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
    if (claimed.count === 0) {
      throw new Error('Event already published');
    }

    const responses = await prisma.response.findMany({
      where: { eventId },
      include: { character: true },
    });

    const team = responses.filter(r => r.status === 'IN' && r.isConfirmed).map(r => r.character.name);
    const bench = responses.filter(r => r.status === 'BENCH' || (r.status === 'IN' && !r.isConfirmed)).map(r => r.character.name);

    const results = await this.notificationService.publishFinalRoster({
      eventId: event.id,
      eventTitle: event.title,
      startTime: event.startTime,
      description: event.description,
      roster: { team, bench },
    });

    if (!results.some(r => r.success)) {
      await prisma.event.updateMany({ where: { id: eventId }, data: { isPublished: false } });
      throw new Error('Publication failed on every channel');
    }

    return { published: true };
  }

  async getEvent(id: string) {
    const event = await this.eventRepo.findById(id);
    if (!event) {
      throw new Error('Event not found');
    }
    return event;
  }

  async listEvents(limit: number = 20, offset: number = 0) {
    return this.eventRepo.findAll(limit, offset);
  }
}
