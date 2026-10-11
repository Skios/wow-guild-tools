import { EventRepository } from '../repositories/event.repository.js';
import { CreateEventInput } from '../validators/event.validator.js';
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

    // 1. Lock Event
    await prisma.event.update({
      where: { id: eventId },
      data: { isPublished: true },
    });

    // 2. Get Final Roster
    const responses = await prisma.response.findMany({
      where: { eventId },
      include: { character: true }
    });

    const team = responses.filter(r => r.status === 'IN' && r.isConfirmed).map(r => r.character.name);
    const bench = responses.filter(r => r.status === 'BENCH' || (r.status === 'IN' && !r.isConfirmed)).map(r => r.character.name);

    // 3. Notify
    await this.notificationService.publishFinalRoster({
      eventId: event.id,
      eventTitle: event.title,
      startTime: event.startTime,
      roster: { team, bench }
    });

    return { published: true };
  }

  async getEvent(id: string) {
    const event = await this.eventRepo.findById(id);
    if (!event) {
      throw new Error('Event not found');
    }
    return event;
  }

  async listEvents() {
    return this.eventRepo.findAll();
  }
}
