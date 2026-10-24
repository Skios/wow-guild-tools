import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

const adapter = vi.hoisted(() => ({ sendInvite: vi.fn(), publishFinalRoster: vi.fn(), sendDirect: vi.fn() }));
vi.mock('../integrations/telegram/telegram.adapter.js', () => ({
  TelegramAdapter: class {
    name = 'telegram';
    sendInvite = adapter.sendInvite;
    publishFinalRoster = adapter.publishFinalRoster;
    sendDirect = adapter.sendDirect;
  },
}));

import { ConflictError, NotFoundError } from '../lib/errors.js';
import { EventService } from './event.service.js';

const startTime = new Date('2026-10-18T19:00:00Z');
const event = { id: 'e1', title: 'Raid', startTime, description: null, responses: [] };
const row = (name: string, status: string, isConfirmed: boolean, role = 'DPS') => ({
  status,
  isConfirmed,
  character: { name, role },
});

const input = {
  title: 'Raid',
  startTime: '2026-10-18T19:00:00Z',
  endTime: '2026-10-18T22:00:00Z',
  createdByUserId: 'u1',
};

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
  adapter.sendInvite.mockResolvedValue({ success: true });
  adapter.publishFinalRoster.mockResolvedValue({ success: true });
  adapter.sendDirect.mockResolvedValue({ success: true });
});

describe('EventService.createEvent', () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1' });
    prismaMock.event.create.mockResolvedValue({ ...event });
  });

  test('creates the event and sends the invite', async () => {
    const created = await new EventService().createEvent(input);

    expect(created.id).toBe('e1');
    expect(prismaMock.event.create).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(adapter.sendInvite).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'e1' })));
  });

  test('a creator is optional, and then nobody is looked up', async () => {
    const { createdByUserId: _omit, ...withoutCreator } = input;

    await expect(new EventService().createEvent(withoutCreator)).resolves.toMatchObject({ id: 'e1' });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.event.create.mock.calls[0]![0].data).not.toHaveProperty('createdBy');
  });

  test('refuses an unknown creator before writing anything', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(new EventService().createEvent(input)).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });

  test('refuses an end time that is not after the start, even if called without the validator', async () => {
    await expect(new EventService().createEvent({ ...input, endTime: input.startTime })).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/after start/i) });
    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });

  test('still returns the event when the invite throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    adapter.sendInvite.mockRejectedValue(new Error('telegram down'));

    await expect(new EventService().createEvent(input)).resolves.toMatchObject({ id: 'e1' });
    spy.mockRestore();
  });

  test('still returns the event when the invite reports failure', async () => {
    adapter.sendInvite.mockResolvedValue({ success: false, error: '429' });

    await expect(new EventService().createEvent(input)).resolves.toMatchObject({ id: 'e1' });
  });

  test('propagates database failures', async () => {
    prismaMock.event.create.mockRejectedValue(new Error('db down'));

    await expect(new EventService().createEvent(input)).rejects.toThrow('db down');
  });
});

describe('EventService.getEvent', () => {
  test('returns the event', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event);
    await expect(new EventService().getEvent('e1')).resolves.toEqual(event);
  });

  test('throws NotFoundError for an unknown event', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    await expect(new EventService().getEvent('nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('EventService.listEvents', () => {
  const answer = (status: string, isConfirmed = false, inRoster = true) => ({ status, isConfirmed, character: { inRoster } });

  beforeEach(() => prismaMock.character.count.mockResolvedValue(10));

  test('summarises responses per event instead of returning every row', async () => {
    prismaMock.event.findMany.mockResolvedValue([
      {
        ...event,
        responses: [
          answer('IN', true), answer('IN'), answer('OUT'), answer('TENTATIVE'), answer('BENCH'), answer('IN', true), answer('LATE', true),
        ],
      },
    ]);

    const [listed] = await new EventService().listEvents(20, 0);

    expect(listed).not.toHaveProperty('responses');
    expect(listed!.counts).toMatchObject({ in: 3, out: 1, tentative: 1, bench: 1, late: 1, confirmed: 3 });
  });

  test('counts roster members who have not answered yet', async () => {
    prismaMock.event.findMany.mockResolvedValue([{ ...event, responses: [answer('IN'), answer('OUT'), answer('IN', false, false)] }]);

    const [listed] = await new EventService().listEvents(20, 0);

    // 10 in the roster, 2 of them answered; the third answer is an alt outside the roster
    expect(listed!.counts.noAnswer).toBe(8);
  });

  test('never reports a negative number of missing answers', async () => {
    prismaMock.character.count.mockResolvedValue(1);
    prismaMock.event.findMany.mockResolvedValue([{ ...event, responses: [answer('IN'), answer('OUT')] }]);

    const [listed] = await new EventService().listEvents(20, 0);

    expect(listed!.counts.noAnswer).toBe(0);
  });

  test('returns zero counts for an event nobody answered, and the whole roster as unanswered', async () => {
    prismaMock.event.findMany.mockResolvedValue([event]);

    const [listed] = await new EventService().listEvents(20, 0);

    expect(listed!.counts).toEqual({ in: 0, out: 0, tentative: 0, bench: 0, late: 0, confirmed: 0, noAnswer: 10 });
  });

  test('passes pagination to the database and returns an empty list as is', async () => {
    prismaMock.event.findMany.mockResolvedValue([]);

    await expect(new EventService().listEvents(5, 10)).resolves.toEqual([]);
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5, skip: 10 }));
  });
});

describe('EventService.getEventDetail', () => {
  const rosterRow = (name: string, user: unknown) => ({ id: `c-${name}`, name, realm: 'Silvermoon', class: 'MAGE', spec: 'FIRE', role: 'RANGED_DPS', user });

  test('adds the roster members who have not answered, saying whether the bot can reach them', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event);
    prismaMock.character.findMany.mockResolvedValue([
      rosterRow('Reachable', { username: 'r', identities: [{ id: 'i1' }] }),
      rosterRow('NeverStartedBot', { username: 'n', identities: [] }),
      rosterRow('Unclaimed', null),
    ]);

    const detail = await new EventService().getEventDetail('e1');

    expect(detail.noAnswer).toEqual([
      expect.objectContaining({ name: 'Reachable', username: 'r', reachable: true }),
      expect.objectContaining({ name: 'NeverStartedBot', username: 'n', reachable: false }),
      expect.objectContaining({ name: 'Unclaimed', username: null, reachable: false }),
    ]);
    expect(prismaMock.character.findMany.mock.calls[0]![0].where).toEqual({
      inRoster: true,
      responses: { none: { eventId: 'e1' } },
    });
  });

  test("names show the account's nickname, for answers and for the missing", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      ...event,
      responses: [{ status: 'IN', character: { name: 'Thrall', nickname: 'old', user: { username: 't', nickname: 'Matte' } } }],
    });
    prismaMock.character.findMany.mockResolvedValue([{ ...rosterRow('Jaina', { username: 'j', nickname: 'Jay', identities: [] }), nickname: null }]);

    const detail = await new EventService().getEventDetail('e1');

    expect(detail.responses[0]!.character.nickname).toBe('Matte');
    expect(detail.noAnswer[0]!.nickname).toBe('Jay');
  });

  test("each answer lists the player's other approved characters that haven't answered, to switch to", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      ...event,
      responses: [{ status: 'IN', characterId: 'c-Alt', character: { id: 'c-Alt', name: 'Alt', userId: 'u1', user: { username: 't', nickname: null } } }],
    });
    prismaMock.character.findMany.mockResolvedValue([
      { ...rosterRow('Main', { username: 't', identities: [] }), userId: 'u1', class: 'WARRIOR', spec: 'PROTECTION', role: 'TANK' },
      { ...rosterRow('Stranger', { username: 's', identities: [] }), userId: 'u2' },
    ]);

    const detail = await new EventService().getEventDetail('e1');

    expect(detail.responses[0]!.alternatives).toEqual([{ id: 'c-Main', name: 'Main', class: 'WARRIOR', spec: 'PROTECTION', role: 'TANK' }]);
  });

  test("the role target is the event's own, else the guild default (marked as such)", async () => {
    prismaMock.character.findMany.mockResolvedValue([]);
    prismaMock.setting.findUnique.mockResolvedValue({ key: 'roleTarget', value: { mode: 'flex', tanks: 1, healersPer5: 1.5, meleeShare: 30 } });

    prismaMock.event.findUnique.mockResolvedValue({ ...event, roleTarget: null });
    expect(await new EventService().getEventDetail('e1')).toMatchObject({
      roleTarget: { mode: 'flex', tanks: 1, healersPer5: 1.5, meleeShare: 30 }, roleTargetIsDefault: true,
    });

    const own = { mode: 'fixed', size: 10, tanks: 2, healers: 2, melee: 3, ranged: 3 };
    prismaMock.event.findUnique.mockResolvedValue({ ...event, roleTarget: own });
    expect(await new EventService().getEventDetail('e1')).toMatchObject({ roleTarget: own, roleTargetIsDefault: false });
  });

  test('no guild default saved, or a broken one: the built-in default', async () => {
    prismaMock.character.findMany.mockResolvedValue([]);
    prismaMock.event.findUnique.mockResolvedValue({ ...event, roleTarget: null });
    prismaMock.setting.findUnique.mockResolvedValue({ key: 'roleTarget', value: { mode: 'nonsense' } });

    expect((await new EventService().getEventDetail('e1')).roleTarget).toEqual({ mode: 'flex', tanks: 2, healersPer5: 1, meleeShare: 50 });
  });

  test('404 for an unknown event, without querying the roster', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);

    await expect(new EventService().getEventDetail('nope')).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.character.findMany).not.toHaveBeenCalled();
  });

  test('an empty roster means nobody is missing', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event);
    prismaMock.character.findMany.mockResolvedValue([]);

    await expect(new EventService().getEventDetail('e1')).resolves.toMatchObject({ noAnswer: [] });
  });
});

describe('EventService.publishEvent', () => {
  beforeEach(() => {
    prismaMock.event.findUnique.mockResolvedValue(event);
    prismaMock.event.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.response.findMany.mockResolvedValue([
      row('Tank', 'IN', true, 'TANK'),
      row('Maybe', 'IN', false),
      row('Bench', 'BENCH', false),
      row('Out', 'OUT', false),
      row('Tent', 'TENTATIVE', false),
    ]);
  });

  test('team = confirmed IN, bench = unconfirmed IN + BENCH (sorted); OUT and TENTATIVE are left out', async () => {
    await new EventService().publishEvent('e1');

    expect(adapter.publishFinalRoster).toHaveBeenCalledWith(
      expect.objectContaining({ roster: { team: ['Tank'], bench: ['Bench', 'Maybe'] } }),
    );
  });

  test('sorted by the role played that night: a warrior told to play its off-spec tank comes first', async () => {
    prismaMock.response.findMany.mockResolvedValue([
      row('Tank', 'IN', true, 'TANK'),
      { ...row('Aaron', 'IN', true, 'DPS'), spec: 'PROTECTION', character: { name: 'Aaron', role: 'DPS', class: 'WARRIOR' } },
    ]);

    await new EventService().publishEvent('e1');

    expect(adapter.publishFinalRoster).toHaveBeenCalledWith(expect.objectContaining({ roster: { team: ['Aaron', 'Tank'], bench: [] } }));
  });

  test('a confirmed late player is on the team; an unconfirmed one is on the bench', async () => {
    prismaMock.response.findMany.mockResolvedValue([
      row('Tank', 'IN', true, 'TANK'),
      row('Runner', 'LATE', true),
      row('Maybe', 'LATE', false),
    ]);

    await new EventService().publishEvent('e1');

    expect(adapter.publishFinalRoster).toHaveBeenCalledWith(
      expect.objectContaining({ roster: { team: ['Tank', 'Runner'], bench: ['Maybe'] } }),
    );
  });

  test('orders the team tank, healer, melee, ranged and then by name', async () => {
    prismaMock.response.findMany.mockResolvedValue([
      row('Zed', 'IN', true, 'RANGED_DPS'),
      row('Bob', 'IN', true, 'DPS'),
      row('Amy', 'IN', true, 'DPS'),
      row('Cleo', 'IN', true, 'HEALER'),
      row('Tom', 'IN', true, 'TANK'),
    ]);

    await new EventService().publishEvent('e1');

    expect(adapter.publishFinalRoster.mock.calls[0]![0].roster.team).toEqual(['Tom', 'Cleo', 'Amy', 'Bob', 'Zed']);
  });

  test('404 for an unknown event, without locking anything', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);

    await expect(new EventService().publishEvent('nope')).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.event.updateMany).not.toHaveBeenCalled();
  });

  test('409 when already published, and does not post a second time', async () => {
    prismaMock.event.updateMany.mockResolvedValue({ count: 0 });

    await expect(new EventService().publishEvent('e1')).rejects.toBeInstanceOf(ConflictError);
    expect(adapter.publishFinalRoster).not.toHaveBeenCalled();
  });

  test('refuses to publish with nobody confirmed, and unlocks the event', async () => {
    prismaMock.response.findMany.mockResolvedValue([row('Maybe', 'IN', false), row('Out', 'OUT', false)]);

    await expect(new EventService().publishEvent('e1')).rejects.toThrow(/confirm/i);
    expect(prismaMock.event.updateMany).toHaveBeenLastCalledWith({ where: { id: 'e1' }, data: { isPublished: false } });
    expect(adapter.publishFinalRoster).not.toHaveBeenCalled();
  });

  test('refuses to publish an event nobody answered', async () => {
    prismaMock.response.findMany.mockResolvedValue([]);

    await expect(new EventService().publishEvent('e1')).rejects.toBeInstanceOf(ConflictError);
  });

  test('unlocks the event when every channel reports failure', async () => {
    adapter.publishFinalRoster.mockResolvedValue({ success: false, error: 'boom' });

    await expect(new EventService().publishEvent('e1')).rejects.toThrow('Publication failed');
    expect(prismaMock.event.updateMany).toHaveBeenLastCalledWith({ where: { id: 'e1' }, data: { isPublished: false } });
  });

  test('unlocks the event when the channel throws instead of returning an error', async () => {
    adapter.publishFinalRoster.mockRejectedValue(new Error('socket hang up'));

    await expect(new EventService().publishEvent('e1')).rejects.toThrow();
    expect(prismaMock.event.updateMany).toHaveBeenLastCalledWith({ where: { id: 'e1' }, data: { isPublished: false } });
  });

  test('unlocks the event when reading responses fails', async () => {
    prismaMock.response.findMany.mockRejectedValue(new Error('db down'));

    await expect(new EventService().publishEvent('e1')).rejects.toThrow('db down');
    expect(prismaMock.event.updateMany).toHaveBeenLastCalledWith({ where: { id: 'e1' }, data: { isPublished: false } });
  });

  test('reports success once the message reached at least one channel', async () => {
    await expect(new EventService().publishEvent('e1')).resolves.toMatchObject({ published: true });
  });

  test('two simultaneous publishes post once', async () => {
    prismaMock.event.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValue({ count: 0 });
    const service = new EventService();

    const results = await Promise.allSettled([service.publishEvent('e1'), service.publishEvent('e1')]);

    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(adapter.publishFinalRoster).toHaveBeenCalledTimes(1);
  });
});

describe('EventService.messageCharacters', () => {
  const ids = ['c1', 'c2', 'c3', 'c4'];
  const person = (id: string, user: unknown) => ({ id, name: `Name-${id}`, user });
  const reachable = { identities: [{ platformUserId: '4242' }] };

  beforeEach(() => {
    prismaMock.event.findUnique.mockResolvedValue({ ...event, isPublished: false });
    prismaMock.character.findMany.mockResolvedValue([
      person('c1', reachable),
      person('c2', { identities: [] }),
      person('c3', null),
    ]);
  });

  test('messages the reachable people and says why the others were skipped', async () => {
    const results = await new EventService().messageCharacters('e1', ids);

    expect(results).toEqual([
      { characterId: 'c1', name: 'Name-c1', status: 'sent' },
      { characterId: 'c2', name: 'Name-c2', status: 'unreachable' },
      { characterId: 'c3', name: 'Name-c3', status: 'unclaimed' },
      { characterId: 'c4', name: null, status: 'unknown' },
    ]);
    expect(adapter.sendDirect).toHaveBeenCalledTimes(1);
    expect(adapter.sendDirect).toHaveBeenCalledWith('4242', expect.objectContaining({ eventId: 'e1' }));
  });

  test('uses a default reminder that names the event, or the officer\'s own text', async () => {
    await new EventService().messageCharacters('e1', ['c1']);
    await new EventService().messageCharacters('e1', ['c1'], 'Please answer, we need tanks!');

    expect(adapter.sendDirect.mock.calls[0]![1].text).toContain('Raid');
    expect(adapter.sendDirect.mock.calls[1]![1].text).toBe('Please answer, we need tanks!');
  });

  test('only people on the roster or already in this event can be messaged', async () => {
    await new EventService().messageCharacters('e1', ids);

    expect(prismaMock.character.findMany.mock.calls[0]![0].where).toEqual({
      id: { in: ids },
      OR: [{ inRoster: true }, { responses: { some: { eventId: 'e1' } } }],
    });
  });

  test('a failed delivery is reported per person and does not stop the rest', async () => {
    prismaMock.character.findMany.mockResolvedValue([person('c1', reachable), person('c2', reachable)]);
    adapter.sendDirect.mockResolvedValueOnce({ success: false, error: 'Forbidden: bot was blocked by the user' }).mockResolvedValue({ success: true });

    const results = await new EventService().messageCharacters('e1', ['c1', 'c2']);

    expect(results.map(r => r.status)).toEqual(['failed', 'sent']);
    expect(results[0]).toMatchObject({ error: 'Forbidden: bot was blocked by the user' });
  });

  test('404 for an unknown event, 409 once published, and nothing is sent', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    await expect(new EventService().messageCharacters('e1', ids)).rejects.toBeInstanceOf(NotFoundError);

    prismaMock.event.findUnique.mockResolvedValue({ ...event, isPublished: true });
    await expect(new EventService().messageCharacters('e1', ids)).rejects.toBeInstanceOf(ConflictError);
    expect(adapter.sendDirect).not.toHaveBeenCalled();
  });
});

describe('reminders', () => {
  const NOW = new Date('2026-10-17T12:00:00Z');
  const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
  const live = { id: 'e1', title: 'Raid', startTime: inHours(10), isPublished: false };
  const unsent = (id: string, minutesBefore: number, ev = live) => ({ id, minutesBefore, event: ev });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    prismaMock.reminder.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.findMany.mockResolvedValue([
      { identities: [{ platformUserId: '42' }] },
      { identities: [] }, // never linked Telegram: nobody to write to
    ]);
  });
  afterEach(() => vi.useRealTimers());

  test('a new event gets its reminders, except those whose time has already passed', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1' });
    prismaMock.event.create.mockResolvedValue({ ...event });
    const start = inHours(10).toISOString();

    await new EventService().createEvent({ ...input, startTime: start, endTime: inHours(13).toISOString(), reminders: [1440, 480] });

    expect(prismaMock.event.create.mock.calls[0]![0].data.reminders).toEqual({ create: [{ minutesBefore: 480 }] });
  });

  test('setReminders keeps the sent ones, drops unsent ones no longer wanted, adds the new ones still ahead', async () => {
    prismaMock.event.findUnique.mockResolvedValue({ ...event, startTime: inHours(10) });
    prismaMock.reminder.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.reminder.createMany.mockResolvedValue({ count: 1 });
    prismaMock.reminder.findMany.mockResolvedValue([{ id: 'r1', minutesBefore: 60, sentAt: null }]);

    const result = await new EventService().setReminders('e1', [60, 900]); // the event starts in 10 h: 15 h before is past

    expect(prismaMock.reminder.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'e1', sentAt: null, minutesBefore: { notIn: [60, 900] } } });
    expect(prismaMock.reminder.createMany).toHaveBeenCalledWith({ data: [{ eventId: 'e1', minutesBefore: 60 }], skipDuplicates: true });
    expect(result).toEqual([{ id: 'r1', minutesBefore: 60, sentAt: null }]);
  });

  test('setReminders on a missing event is a 404', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    await expect(new EventService().setReminders('e1', [60])).rejects.toBeInstanceOf(NotFoundError);
  });

  test('sends a due reminder once to each player with no answer on any character, with the answer buttons', async () => {
    prismaMock.reminder.findMany.mockResolvedValue([unsent('r1', 720), unsent('r2', 60)]); // r2 is due in 9 hours

    const result = await new EventService().sendDueReminders();

    expect(prismaMock.reminder.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.reminder.updateMany).toHaveBeenCalledWith({ where: { id: 'r1', sentAt: null }, data: { sentAt: NOW } });
    expect(prismaMock.user.findMany.mock.calls[0]![0].where).toEqual({
      characters: { some: { inRoster: true }, none: { responses: { some: { eventId: 'e1' } } } },
    });
    expect(adapter.sendDirect).toHaveBeenCalledTimes(1);
    expect(adapter.sendDirect).toHaveBeenCalledWith('42', expect.objectContaining({ eventId: 'e1', text: expect.stringMatching(/Reminder: Raid/) }));
    expect(result).toEqual({ reminders: 1, messages: 1 });
  });

  test('two reminders due together for one event send one message', async () => {
    prismaMock.reminder.findMany.mockResolvedValue([unsent('r1', 720), unsent('r2', 1440)]);

    await new EventService().sendDueReminders();

    expect(prismaMock.reminder.updateMany).toHaveBeenCalledTimes(2);
    expect(adapter.sendDirect).toHaveBeenCalledTimes(1);
  });

  test('a reminder another run already took is not sent again', async () => {
    prismaMock.reminder.findMany.mockResolvedValue([unsent('r1', 720)]);
    prismaMock.reminder.updateMany.mockResolvedValue({ count: 0 });

    expect(await new EventService().sendDueReminders()).toEqual({ reminders: 0, messages: 0 });
    expect(adapter.sendDirect).not.toHaveBeenCalled();
  });

  test('closed or already started events: the reminder is used up, nobody is written to', async () => {
    prismaMock.reminder.findMany.mockResolvedValue([
      unsent('r1', 720, { ...live, isPublished: true }),
      unsent('r2', 60, { ...live, id: 'e2', startTime: inHours(-1) }),
    ]);

    await new EventService().sendDueReminders();

    expect(prismaMock.reminder.updateMany).toHaveBeenCalledTimes(2);
    expect(adapter.sendDirect).not.toHaveBeenCalled();
  });

  test('every message failed: the reminder is given back for the next run', async () => {
    prismaMock.reminder.findMany.mockResolvedValue([unsent('r1', 720)]);
    adapter.sendDirect.mockResolvedValue({ success: false, error: 'telegram down' });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await new EventService().sendDueReminders()).toEqual({ reminders: 0, messages: 0 });
    expect(prismaMock.reminder.updateMany).toHaveBeenLastCalledWith({ where: { id: { in: ['r1'] } }, data: { sentAt: null } });
  });

  test('nobody left to write to is not a failure: the reminder stays used', async () => {
    prismaMock.reminder.findMany.mockResolvedValue([unsent('r1', 720)]);
    prismaMock.user.findMany.mockResolvedValue([]);

    expect(await new EventService().sendDueReminders()).toEqual({ reminders: 1, messages: 0 });
    expect(prismaMock.reminder.updateMany).toHaveBeenCalledTimes(1);
  });

  test('a failed delivery is not counted and does not stop the others', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    prismaMock.reminder.findMany.mockResolvedValue([unsent('r1', 720)]);
    prismaMock.user.findMany.mockResolvedValue([{ identities: [{ platformUserId: '1' }] }, { identities: [{ platformUserId: '2' }] }]);
    adapter.sendDirect.mockResolvedValueOnce({ success: false, error: 'blocked' });

    expect(await new EventService().sendDueReminders()).toEqual({ reminders: 1, messages: 1 });
    expect(adapter.sendDirect).toHaveBeenCalledTimes(2);
  });
});
