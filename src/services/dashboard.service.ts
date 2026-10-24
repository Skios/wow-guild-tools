import type { ResponseStatus, WoWRole } from '@prisma/client';
import { prisma } from '../config/db.js';
import { specRole } from '../domain/wow.js';
import { NotFoundError } from '../lib/errors.js';
import { eventState } from '../domain/event-state.js';
import { ResponseService } from './response.service.js';
import { defaultRoleTarget, readTarget, seasonStart } from './settings.service.js';

const UPCOMING = 10;
const PUBLISH_SOON_MS = 24 * 3_600_000;
const MINUTE_MS = 60_000;

export type Span = number | 'season';
export type QuickAnswer = { characterId: string; status: Extract<ResponseStatus, 'IN' | 'LATE' | 'TENTATIVE' | 'OUT'>; lateMinutes?: number | undefined; note?: string | undefined };

const attending = (status: ResponseStatus) => status === 'IN' || status === 'LATE';
const nameOf = (user: { username: string; nickname: string | null }) => user.nickname || user.username;

/** How one answer counts in attendance. An unconfirmed IN/LATE was benched at publish. */
type Bucket = 'in' | 'late' | 'bench' | 'out' | 'tentative';
function bucket(answer: { status: ResponseStatus; isConfirmed: boolean }): Bucket {
  if (attending(answer.status)) return !answer.isConfirmed ? 'bench' : answer.status === 'IN' ? 'in' : 'late';
  return answer.status === 'BENCH' ? 'bench' : answer.status === 'OUT' ? 'out' : 'tentative';
}
// When a player answered with two characters, the one that counts most for them.
const RANK: Record<Bucket, number> = { in: 0, late: 1, bench: 2, tentative: 3, out: 4 };

/** The home page: what any player sees, plus the officer sections their capabilities open. */
export class DashboardService {
  private responses = new ResponseService();

  /** Upcoming events (published ones too, to show "you're in"), my answer to each, my approved characters. */
  async myEvents(userId: string) {
    const [characters, events] = await Promise.all([
      prisma.character.findMany({
        where: { userId, inRoster: true }, orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, class: true, spec: true, role: true },
      }),
      prisma.event.findMany({
        where: { endTime: { gt: new Date() } }, orderBy: { startTime: 'asc' }, take: UPCOMING,
        select: { id: true, title: true, startTime: true, endTime: true, isPublished: true, canceledAt: true },
      }),
    ]);
    const answers = characters.length && events.length
      ? await prisma.response.findMany({
        where: { eventId: { in: events.map(e => e.id) }, characterId: { in: characters.map(c => c.id) } },
        select: { eventId: true, characterId: true, status: true, isConfirmed: true, arrivalTime: true, note: true },
      })
      : [];
    return { characters, events: events.map(e => ({ ...e, state: eventState(e), answer: answers.find(a => a.eventId === e.id) ?? null })) };
  }

  /** The player answers from the site: with the character they pick (the answer moves if another was answering). */
  async answer(userId: string, eventId: string, { characterId, status, lateMinutes, note }: QuickAnswer) {
    const mine = await prisma.character.findFirst({ where: { id: characterId, userId, inRoster: true }, select: { id: true } });
    if (!mine) throw new NotFoundError('Not one of your approved characters');
    const current = await prisma.response.findFirst({
      where: { eventId, character: { userId, inRoster: true } }, select: { characterId: true },
    });
    if (current && current.characterId !== characterId) await this.responses.moveResponse(eventId, current.characterId, characterId);
    await this.responses.updateResponse(eventId, characterId, status, undefined, lateMinutes);
    if (note !== undefined) await this.responses.setNote(eventId, characterId, note.trim() || null);
  }

  /** Per open event: confirmed per role played, no answers, the target in use, the next reminder. */
  async composition() {
    const now = new Date();
    const [events, rosterSize, fallback] = await Promise.all([
      prisma.event.findMany({
        // Not over and not cancelled: open ones and published ones still being adjusted.
        where: { canceledAt: null, endTime: { gt: now } }, orderBy: { startTime: 'asc' }, take: UPCOMING,
        select: {
          id: true, title: true, startTime: true, endTime: true, isPublished: true, canceledAt: true, roleTarget: true,
          responses: { select: { status: true, isConfirmed: true, spec: true, character: { select: { class: true, role: true, inRoster: true } } } },
          reminders: { where: { sentAt: null }, select: { minutesBefore: true } },
        },
      }),
      prisma.character.count({ where: { inRoster: true } }),
      defaultRoleTarget(),
    ]);
    return events.map(({ responses, reminders, roleTarget, ...event }) => {
      const byRole: Record<WoWRole, number> = { TANK: 0, HEALER: 0, DPS: 0, RANGED_DPS: 0 };
      const team = responses.filter(r => attending(r.status) && r.isConfirmed);
      for (const r of team) {
        const role = (r.spec && specRole(r.character.class, r.spec)) || r.character.role;
        byRole[role] += 1;
      }
      const upcoming = reminders.map(r => event.startTime.getTime() - r.minutesBefore * MINUTE_MS).filter(t => t > now.getTime());
      return {
        ...event,
        state: eventState(event, now),
        confirmed: team.length,
        byRole,
        noAnswer: Math.max(0, rosterSize - responses.filter(r => r.character.inRoster).length),
        roleTarget: roleTarget === null ? fallback : readTarget(roleTarget, fallback),
        nextReminder: upcoming.length ? new Date(Math.min(...upcoming)) : null,
      };
    });
  }

  /** What needs an officer, limited to what their role covers. */
  async todo(capabilities: string[]) {
    const can = (c: string) => capabilities.includes(c);
    const now = new Date();
    const result: { pendingApprovals?: number; toPublish?: { id: string; title: string; startTime: Date }[]; noTelegram?: { id: string; name: string }[] } = {};
    if (can('roster.approve')) {
      result.pendingApprovals = await prisma.character.count({ where: { inRoster: false, userId: { not: null } } });
    }
    if (can('events.manage')) {
      result.toPublish = await prisma.event.findMany({
        where: { isPublished: false, canceledAt: null, startTime: { gt: now, lte: new Date(now.getTime() + PUBLISH_SOON_MS) } },
        orderBy: { startTime: 'asc' }, select: { id: true, title: true, startTime: true },
      });
      const unreachable = await prisma.user.findMany({
        where: { characters: { some: { inRoster: true } }, identities: { none: { platform: 'telegram' } } },
        select: { id: true, username: true, nickname: true },
      });
      result.noTelegram = unreachable.map(u => ({ id: u.id, name: nameOf(u) }));
    }
    return result;
  }

  /**
   * Per player with approved characters, over the last `span` published events or the whole season:
   * how often they played, came late, sat on the bench, said out or maybe, or didn't answer.
   * ponytail: a player who joined mid-span counts the earlier events as "no answer".
   */
  async attendance(span: Span) {
    const since = span === 'season' ? await seasonStart() : null;
    const events = await prisma.event.findMany({
      // Published ahead of time doesn't count until it has started.
      where: { isPublished: true, canceledAt: null, startTime: { lte: new Date(), ...(since && { gte: since }) } },
      orderBy: { startTime: 'desc' }, ...(span !== 'season' && { take: span }), select: { id: true },
    });
    const players = await prisma.user.findMany({ where: { characters: { some: { inRoster: true } } }, select: { id: true, username: true, nickname: true } });
    const answers = events.length && players.length
      ? await prisma.response.findMany({
        where: { eventId: { in: events.map(e => e.id) }, character: { userId: { in: players.map(p => p.id) } } },
        select: { eventId: true, status: true, isConfirmed: true, character: { select: { userId: true } } },
      })
      : [];

    // Each player's best answer per event (they may have answered with two characters).
    const best = new Map<string, Bucket>();
    for (const a of answers) {
      const key = `${a.eventId}:${a.character.userId}`;
      const b = bucket(a);
      const seen = best.get(key);
      if (!seen || RANK[b] < RANK[seen]) best.set(key, b);
    }
    const rows = players.map(player => {
      const counts = { in: 0, late: 0, bench: 0, out: 0, tentative: 0, noAnswer: 0 };
      for (const event of events) counts[best.get(`${event.id}:${player.id}`) ?? 'noAnswer'] += 1;
      return { id: player.id, name: nameOf(player), ...counts };
    });
    return { span, events: events.length, players: rows.sort((a, b) => a.name.localeCompare(b.name)) };
  }
}
