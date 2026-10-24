import { Prisma, type Event, type ResponseStatus } from '@prisma/client';
import { prisma } from '../config/db.js';
import { shownNickname } from './roster.service.js';
import { ROLE_ORDER, specLabel, specRole } from '../domain/wow.js';
import { eventState } from '../domain/event-state.js';
import { TelegramAdapter } from '../integrations/telegram/telegram.adapter.js';
import { AppError, ConflictError, NotFoundError } from '../lib/errors.js';
import { EventRepository } from '../repositories/event.repository.js';
import type { CreateEventInput } from '../validators/event.validator.js';
import type { RoleTarget } from '../validators/role-target.validator.js';
import { ROLE_TARGET_KEY, defaultRoleTarget, readTarget } from './settings.service.js';
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

type RosterRow = { status: ResponseStatus; isConfirmed: boolean; spec?: string | null; character: { name: string; class?: string; role: keyof typeof ROLE_ORDER } };

/** The role played that night: the off-spec's an officer picked, else the character's own. */
const playedRole = (r: RosterRow) => (r.spec && specRole(r.character.class, r.spec)) || r.character.role;

const attending = (status: ResponseStatus) => status === 'IN' || status === 'LATE';

function buildRoster(rows: RosterRow[]) {
  const byRoleThenName = (a: RosterRow, b: RosterRow) =>
    ROLE_ORDER[playedRole(a)] - ROLE_ORDER[playedRole(b)] || a.character.name.localeCompare(b.character.name);
  const names = (list: RosterRow[]) => [...list].sort(byRoleThenName).map(r => r.character.name);

  return {
    team: names(rows.filter(r => attending(r.status) && r.isConfirmed)),
    bench: names(rows.filter(r => r.status === 'BENCH' || (attending(r.status) && !r.isConfirmed))),
  };
}

const MINUTE_MS = 60_000;


/** Reminders still ahead of now; one already due would go out at once, on top of the invite. */
const stillAhead = (startTime: Date, minutesBefore: number[] | undefined) =>
  minutesBefore?.filter(minutes => startTime.getTime() - minutes * MINUTE_MS > Date.now());

const reminderText = (event: { title: string; startTime: Date }) =>
  `Reminder: ${event.title} on ${event.startTime.toLocaleString()}. Are you coming?`;

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

    const event = await this.eventRepo.create({ ...data, reminders: stillAhead(new Date(data.startTime), data.reminders) });

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

  async finalizeRoster(eventId: string, selections: { characterId: string; status: ResponseStatus; isConfirmed: boolean; lateMinutes?: number | undefined; spec?: string | null | undefined }[]) {
    return this.responseService.bulkUpdateResponses(eventId, selections);
  }

  async publishEvent(eventId: string) {
    const event = await this.getEvent(eventId);

    if (event.canceledAt) throw new ConflictError('This event is cancelled');

    // The first publish claims the lock atomically; later ones post an update. A cancel landing meanwhile wins.
    // ponytail: two publishes at the same instant both post (final, then update); the UI disables the button.
    const claimed = await prisma.event.updateMany({ where: { id: eventId, isPublished: false, canceledAt: null }, data: { isPublished: true } });
    const first = claimed.count === 1;
    if (!first && (await prisma.event.findUnique({ where: { id: eventId }, select: { canceledAt: true } }))?.canceledAt) {
      throw new ConflictError('This event is cancelled');
    }

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
        updated: !first,
      });
      if (!channels.some(c => c.success)) throw new AppError('Publication failed on every channel', 502);
    } catch (error) {
      // Nothing reached the channel: a first publish goes back to open so the officers can fix it and retry.
      if (first) await prisma.event.updateMany({ where: { id: eventId }, data: { isPublished: false } });
      throw error;
    }
    // The roster is out: whatever happens with the DMs, sign-ups stay closed.
    const told = await this.tellAssignments(event).catch(error => {
      console.error('Telling players their assignment failed:', error);
      return 0;
    });
    return { published: true, updated: !first, told };
  }

  /**
   * Tells each confirmed player what an officer changed for them: another of their characters, or an off-spec.
   * Each change is told once (Response.toldAssignment); a change back to normal is told too.
   */
  private async tellAssignments(event: { id: string; title: string; startTime: Date }) {
    const answers = await prisma.response.findMany({
      where: { eventId: event.id, isConfirmed: true, status: { in: ['IN', 'LATE'] } },
      select: {
        id: true, characterId: true, spec: true, switchedFrom: true, toldAssignment: true,
        character: { select: { name: true, class: true, spec: true, user: { select: { identities: { where: { platform: 'telegram' }, select: { platformUserId: true } } } } } },
      },
    });
    const originals = await prisma.character.findMany({
      where: { id: { in: answers.flatMap(a => (a.switchedFrom ? [a.switchedFrom] : [])) } }, select: { id: true, name: true },
    });
    let told = 0;
    for (const a of answers) {
      const assignment = `${a.characterId}|${a.spec ?? ''}`;
      const changed = Boolean(a.switchedFrom || a.spec);
      if (assignment === a.toldAssignment || (!changed && a.toldAssignment === null)) continue;
      const telegramId = a.character.user?.identities[0]?.platformUserId;
      if (!telegramId) continue;
      const from = originals.find(o => o.id === a.switchedFrom)?.name;
      const spec = a.spec ? specLabel(a.character.class, a.spec) : 'your main spec';
      const text = `${event.title} on ${event.startTime.toLocaleString()}: you're in with ${a.character.name}${from ? ` (not ${from})` : ''}, playing ${spec}.`;
      const sent = await this.notificationService.sendDirect('telegram', telegramId, { text });
      if (!sent.success) continue;
      await prisma.response.update({ where: { id: a.id }, data: { toldAssignment: changed ? assignment : null } });
      told += 1;
    }
    return told;
  }

  /** Cancels an event that hasn't started: a post in the channel and a DM to whoever said they'd come or might. */
  async cancelEvent(eventId: string) {
    const event = await this.getEvent(eventId);
    if (event.startTime <= new Date()) throw new ConflictError('The event has already started');
    // Conditional, so two cancels at once announce once.
    const done = await prisma.event.updateMany({ where: { id: eventId, canceledAt: null }, data: { canceledAt: new Date() } });
    if (done.count === 0) throw new ConflictError('Already cancelled');
    const text = `${event.title} on ${event.startTime.toLocaleString()} is cancelled.`;
    const channels = await this.notificationService.announce(`❌ ${text}`);
    // Unsent reminders stay: while cancelled they are used up unsent, and the ones still ahead come back on reopen.
    const answered = await prisma.response.findMany({
      where: { eventId, status: { in: ['IN', 'LATE', 'TENTATIVE'] } },
      select: { character: { select: { user: { select: { identities: { where: { platform: 'telegram' }, select: { platformUserId: true } } } } } } },
    });
    const ids = [...new Set(answered.flatMap(a => a.character.user?.identities.map(i => i.platformUserId) ?? []))];
    let messages = 0;
    for (const telegramId of ids) {
      if ((await this.notificationService.sendDirect('telegram', telegramId, { text })).success) messages += 1;
    }
    return { channels, messages };
  }

  /** Undoes a cancel before the start: the event is open again (published stays published). */
  async reopenEvent(eventId: string) {
    const event = await this.getEvent(eventId);
    if (event.startTime <= new Date()) throw new ConflictError('The event has already started');
    const done = await prisma.event.updateMany({ where: { id: eventId, canceledAt: { not: null } }, data: { canceledAt: null } });
    if (done.count === 0) throw new ConflictError('The event is not cancelled');
    const channels = await this.notificationService.announce(`✅ ${event.title} on ${event.startTime.toLocaleString()} is back on.`);
    return { channels };
  }

  async defaultRoleTarget(): Promise<RoleTarget> {
    return defaultRoleTarget();
  }

  async setDefaultRoleTarget(target: RoleTarget) {
    await prisma.setting.upsert({ where: { key: ROLE_TARGET_KEY }, create: { key: ROLE_TARGET_KEY, value: target }, update: { value: target } });
  }

  /** The event's own target; null = follow the guild default. */
  async setEventRoleTarget(eventId: string, target: RoleTarget | null) {
    await this.getEvent(eventId);
    await prisma.event.update({ where: { id: eventId }, data: { roleTarget: target ?? Prisma.DbNull } });
  }

  /** An officer swaps which of a player's characters comes to the event. */
  async switchCharacter(eventId: string, fromCharacterId: string, toCharacterId: string) {
    await this.responseService.switchCharacter(eventId, fromCharacterId, toCharacterId);
  }

  /** Privately reminds people who have not answered. Each person gets their own delivery result. */
  async messageCharacters(eventId: string, characterIds: string[], customText?: string) {
    const event = await this.getEvent(eventId);
    if (event.isPublished) throw new ConflictError('Event already published');
    if (event.canceledAt) throw new ConflictError('This event is cancelled');

    const text = customText ?? reminderText(event);
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

  /** The event's reminders become exactly these; the ones already sent stay, as a record. */
  async setReminders(eventId: string, minutesBefore: number[]) {
    const event = await this.getEvent(eventId);
    const ahead = stillAhead(event.startTime, minutesBefore) ?? [];
    await prisma.$transaction([
      prisma.reminder.deleteMany({ where: { eventId, sentAt: null, minutesBefore: { notIn: minutesBefore } } }),
      prisma.reminder.createMany({ data: ahead.map(m => ({ eventId, minutesBefore: m })), skipDuplicates: true }),
    ]);
    return prisma.reminder.findMany({ where: { eventId }, orderBy: { minutesBefore: 'desc' }, select: { id: true, minutesBefore: true, sentAt: true } });
  }

  /**
   * Sends every reminder that is due (pg_cron calls this through POST /reminders/run). Each one is claimed before
   * sending, so two runs never send it twice; one for an event that is closed or has started is used up unsent.
   */
  async sendDueReminders() {
    const now = new Date();
    const unsent = await prisma.reminder.findMany({
      where: { sentAt: null },
      select: { id: true, minutesBefore: true, event: { select: { id: true, title: true, startTime: true, isPublished: true, canceledAt: true } } },
    });
    const due = unsent.filter(r => r.event.startTime.getTime() - r.minutesBefore * MINUTE_MS <= now.getTime());

    const events = new Map<string, { event: (typeof due)[number]['event']; ids: string[] }>();
    let reminders = 0;
    for (const r of due) {
      const claimed = await prisma.reminder.updateMany({ where: { id: r.id, sentAt: null }, data: { sentAt: now } });
      if (claimed.count === 0) continue;
      reminders += 1;
      if (r.event.isPublished || r.event.canceledAt || r.event.startTime <= now) continue;
      const entry = events.get(r.event.id) ?? { event: r.event, ids: [] };
      events.set(r.event.id, { ...entry, ids: [...entry.ids, r.id] });
    }

    let messages = 0;
    for (const { event, ids } of events.values()) {
      const { tried, sent } = await this.remindUnanswered(event);
      messages += sent;
      // Every message failed (Telegram down): give them back, the next run tries again.
      if (tried > 0 && sent === 0) {
        await prisma.reminder.updateMany({ where: { id: { in: ids } }, data: { sentAt: null } });
        reminders -= ids.length;
      }
    }
    return { reminders, messages };
  }

  /** One private message per player whose approved characters have not answered: how many were tried, how many arrived. */
  private async remindUnanswered(event: { id: string; title: string; startTime: Date }) {
    const players = await prisma.user.findMany({
      where: { characters: { some: { inRoster: true }, none: { responses: { some: { eventId: event.id } } } } },
      select: { identities: { where: { platform: 'telegram' }, select: { platformUserId: true } } },
    });
    const telegramIds = players.flatMap(p => p.identities.map(i => i.platformUserId));
    let sent = 0;
    // ponytail: one message at a time (well under Telegram's 30/s); batch if a roster ever gets to hundreds.
    for (const telegramId of telegramIds) {
      const result = await this.notificationService.sendDirect('telegram', telegramId, { text: reminderText(event), eventId: event.id });
      if (result.success) sent += 1;
      else console.warn('Reminder not delivered:', result.error);
    }
    return { tried: telegramIds.length, sent };
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
    // The player's other approved characters that haven't answered: an officer can switch to one of them.
    const alternativesOf = (userId: string | null | undefined) => (userId ? missing.filter(c => c.userId === userId) : [])
      .map(({ id, name, class: cls, spec, role }) => ({ id, name, class: cls, spec, role }));
    const noAnswer = missing.map(({ user, userId, inRoster, isMain, createdAt, updatedAt, ...character }) => {
      void userId; void inRoster; void isMain; void createdAt; void updatedAt;
      return {
        ...character, nickname: shownNickname({ ...character, user }),
        username: user?.username ?? null, reachable: (user?.identities.length ?? 0) > 0,
      };
    });
    const responses = event.responses.map(r => ({
      ...r, character: { ...r.character, nickname: shownNickname(r.character) }, alternatives: alternativesOf(r.character.userId),
    }));
    const own = event.roleTarget === null || event.roleTarget === undefined ? null : readTarget(event.roleTarget);
    const roleTarget = own ?? await this.defaultRoleTarget();
    return { ...event, state: eventState(event), responses, noAnswer, roleTarget, roleTargetIsDefault: own === null };
  }

  async listEvents(limit: number = 20, offset: number = 0) {
    const [events, rosterSize] = await Promise.all([
      this.eventRepo.findAll(limit, offset),
      prisma.character.count({ where: { inRoster: true } }),
    ]);
    return events.map(({ responses, ...event }: Event & { responses: ListedResponse[] }) => ({
      ...event,
      state: eventState(event),
      counts: countResponses(responses, rosterSize),
    }));
  }
}
