import { beforeEach, describe, expect, test, vi } from 'vitest';
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
