import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';
import { buildOfficerRouteApp, buildRouteAppAs, prismaError, uuid } from '../test/helpers.js';

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

import { eventRoutes } from './event.controller.js';

const NOW = new Date('2026-10-17T12:00:00Z');
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();
const newEvent = () => ({ title: 'Raid', startTime: inHours(24), endTime: inHours(27) });
const EID = uuid(10);

const app = () => buildOfficerRouteApp(eventRoutes);
const post = async (url: string, payload?: unknown) => (await app()).inject({ method: 'POST', url, ...(payload !== undefined && { payload: payload as object }) });
const patch = async (url: string, payload: unknown) => (await app()).inject({ method: 'PATCH', url, payload: payload as object });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetPrismaMock();
  vi.clearAllMocks();
  adapter.sendInvite.mockResolvedValue({ success: true });
  adapter.publishFinalRoster.mockResolvedValue({ success: true });
  adapter.sendDirect.mockResolvedValue({ success: true });
});
afterEach(() => vi.useRealTimers());

describe('POST /events', () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue({ id: uuid(1) });
    prismaMock.event.create.mockResolvedValue({ id: EID, title: 'Raid', startTime: new Date(inHours(24)), description: null });
  });

  test('creates the event and answers 201', async () => {
    const res = await post('/events', newEvent());

    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBe(EID);
  });

  test('400 with readable issues for an invalid body, and nothing is written', async () => {
    const res = await post('/events', { ...newEvent(), title: '   ' });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].path).toBe('title');
    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });

  test.each([undefined, {}, []])('400 for the body %j', async (body) => {
    expect((await post('/events', body)).statusCode).toBe(400);
  });

  test('415 for a body that is not JSON', async () => {
    expect((await post('/events', 'text')).statusCode).toBe(415);
  });

  test('400 for malformed JSON', async () => {
    const res = await (await app()).inject({
      method: 'POST', url: '/events', payload: '{"title": ', headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });

  test('records the signed-in officer as creator, whatever the body claims', async () => {
    const res = await post('/events', { ...newEvent(), createdByUserId: uuid(99), createdBy: uuid(99) });

    expect(res.statusCode).toBe(201);
    expect(prismaMock.event.create.mock.calls[0]![0].data).toMatchObject({ createdBy: uuid(1) });
  });

  test('database failure does not leak internals', async () => {
    prismaMock.event.create.mockRejectedValue(prismaError('P2002'));

    const res = await post('/events', newEvent());

    expect(res.statusCode).toBe(409);
    expect(res.body).not.toContain('users_secret');
  });

  test('a body claiming isPublished or an id cannot set them', async () => {
    await post('/events', { ...newEvent(), isPublished: true, id: uuid(99) });

    const data = prismaMock.event.create.mock.calls[0]![0].data;
    expect(data).not.toHaveProperty('isPublished');
    expect(data).not.toHaveProperty('id');
  });
});

describe('PATCH /events/:id/roster', () => {
  const selections = [{ characterId: uuid(20), status: 'IN', isConfirmed: true }];

  beforeEach(() => {
    prismaMock.event.findUnique.mockResolvedValue({ isPublished: false });
    prismaMock.response.upsert.mockResolvedValue({});
  });

  test('saves the roster', async () => {
    const res = await patch(`/events/${EID}/roster`, { selections });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true });
  });

  test('400 for a malformed event id', async () => {
    expect((await patch('/events/not-a-uuid/roster', { selections })).statusCode).toBe(400);
  });

  test('400 for an empty roster, a duplicate character and a confirmed bench player', async () => {
    expect((await patch(`/events/${EID}/roster`, { selections: [] })).statusCode).toBe(400);
    expect((await patch(`/events/${EID}/roster`, { selections: [...selections, ...selections] })).statusCode).toBe(400);
    const benched = [{ characterId: uuid(20), status: 'BENCH', isConfirmed: true }];
    expect((await patch(`/events/${EID}/roster`, { selections: benched })).statusCode).toBe(400);
    expect(prismaMock.response.upsert).not.toHaveBeenCalled();
  });

  test('404 for an unknown event', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    expect((await patch(`/events/${EID}/roster`, { selections })).statusCode).toBe(404);
  });

  test('409 once the event is published', async () => {
    prismaMock.event.findUnique.mockResolvedValue({ isPublished: true });
    const res = await patch(`/events/${EID}/roster`, { selections });
    expect(res.statusCode).toBe(409);
  });

  test('400 for a character that does not exist', async () => {
    prismaMock.$transaction.mockRejectedValue(prismaError('P2003'));
    const res = await patch(`/events/${EID}/roster`, { selections });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Invalid reference' });
  });
});

describe('POST /events/:id/publish', () => {
  beforeEach(() => {
    prismaMock.event.findUnique.mockResolvedValue({ id: EID, title: 'Raid', startTime: new Date(), description: null, responses: [] });
    prismaMock.event.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.response.findMany.mockResolvedValue([{ status: 'IN', isConfirmed: true, character: { name: 'Tank', role: 'TANK' } }]);
  });

  test('publishes', async () => {
    const res = await post(`/events/${EID}/publish`);
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  test('404 unknown event', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    expect((await post(`/events/${EID}/publish`)).statusCode).toBe(404);
  });

  test('409 when already published', async () => {
    prismaMock.event.updateMany.mockResolvedValue({ count: 0 });
    expect((await post(`/events/${EID}/publish`)).statusCode).toBe(409);
  });

  test('409 when nobody is confirmed', async () => {
    prismaMock.response.findMany.mockResolvedValue([]);
    const res = await post(`/events/${EID}/publish`);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/confirm/i);
  });

  test('502 when Telegram refuses the message', async () => {
    adapter.publishFinalRoster.mockResolvedValue({ success: false, error: 'chat not found' });
    expect((await post(`/events/${EID}/publish`)).statusCode).toBe(502);
  });

  test('400 for a malformed id', async () => {
    expect((await post('/events/123/publish')).statusCode).toBe(400);
  });
});

describe('GET /events/:id', () => {
  test('returns the event with responses and usernames', async () => {
    prismaMock.event.findUnique.mockResolvedValue({ id: EID, responses: [{ character: { name: 'Thrall', user: { username: 'thrall' } } }] });
    prismaMock.character.findMany.mockResolvedValue([
      { id: 'c9', name: 'Silent', realm: 'Silvermoon', class: 'MAGE', spec: 'FIRE', role: 'RANGED_DPS', user: { username: 'quiet', identities: [{ id: 'i' }] } },
    ]);

    const res = await (await app()).inject(`/events/${EID}`);

    expect(res.statusCode).toBe(200);
    expect(res.json().responses[0].character.user.username).toBe('thrall');
    expect(res.json().noAnswer).toEqual([expect.objectContaining({ name: 'Silent', reachable: true })]);
  });

  test('404 when missing, 400 for a malformed id', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    expect((await (await app()).inject(`/events/${EID}`)).statusCode).toBe(404);
    expect((await (await app()).inject('/events/xyz')).statusCode).toBe(400);
  });
});

describe('GET /events', () => {
  test('lists events with response counts', async () => {
    prismaMock.character.count.mockResolvedValue(0);
    prismaMock.event.findMany.mockResolvedValue([{ id: EID, title: 'Raid', responses: [{ status: 'IN', isConfirmed: true, character: { inRoster: true } }] }]);

    const res = await (await app()).inject('/events');

    expect(res.statusCode).toBe(200);
    expect(res.json()[0].counts.in).toBe(1);
    expect(res.json()[0]).not.toHaveProperty('responses');
  });

  test.each(['limit=0', 'limit=101', 'limit=abc', 'offset=-1', 'limit=1e3', 'limit=5&limit=6'])('400 for ?%s', async (query) => {
    expect((await (await app()).inject(`/events?${query}`)).statusCode).toBe(400);
  });

  test('passes valid pagination to the database', async () => {
    prismaMock.event.findMany.mockResolvedValue([]);
    prismaMock.character.count.mockResolvedValue(0);
    await (await app()).inject('/events?limit=5&offset=10');
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5, skip: 10 }));
  });
});

describe('POST /events/:id/message', () => {
  test('403 for a user who may manage events but not message players', async () => {
    const app = await buildRouteAppAs(['events.manage'], eventRoutes);
    const res = await app.inject({ method: 'POST', url: `/events/${EID}/message`, payload: { characterIds: [CID], text: 'hi' } });
    expect(res.statusCode).toBe(403);
    expect(prismaMock.event.findUnique).not.toHaveBeenCalled();
  });

  const CID = uuid(30);

  beforeEach(() => {
    prismaMock.event.findUnique.mockResolvedValue({ id: EID, title: 'Raid', startTime: new Date(), isPublished: false, responses: [] });
    prismaMock.character.findMany.mockResolvedValue([{ id: CID, name: 'Silent', user: { identities: [{ platformUserId: '42' }] } }]);
  });

  test('sends the message and returns one result per person', async () => {
    const res = await post(`/events/${EID}/message`, { characterIds: [CID], text: 'Where are you?' });

    expect(res.statusCode).toBe(200);
    expect(res.json().results).toEqual([{ characterId: CID, name: 'Silent', status: 'sent' }]);
    expect(adapter.sendDirect).toHaveBeenCalledWith('42', expect.objectContaining({ text: 'Where are you?' }));
  });

  test.each([{}, { characterIds: [] }, { characterIds: ['nope'] }, { characterIds: [CID], text: 'x'.repeat(501) }])('400 for %j', async (body) => {
    expect((await post(`/events/${EID}/message`, body)).statusCode).toBe(400);
    expect(adapter.sendDirect).not.toHaveBeenCalled();
  });

  test('404 for an unknown event and 409 for a published one', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    expect((await post(`/events/${EID}/message`, { characterIds: [CID] })).statusCode).toBe(404);

    prismaMock.event.findUnique.mockResolvedValue({ id: EID, isPublished: true });
    expect((await post(`/events/${EID}/message`, { characterIds: [CID] })).statusCode).toBe(409);
  });

  test('400 for a malformed event id', async () => {
    expect((await post('/events/xyz/message', { characterIds: [CID] })).statusCode).toBe(400);
  });
});
