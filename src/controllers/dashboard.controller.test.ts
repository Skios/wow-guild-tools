import { beforeEach, describe, expect, test, vi } from 'vitest';
import { buildRouteAppAs, uuid } from '../test/helpers.js';

const service = vi.hoisted(() => ({ myEvents: vi.fn(), composition: vi.fn(), todo: vi.fn(), attendance: vi.fn(), answer: vi.fn() }));
vi.mock('../services/dashboard.service.js', () => ({ DashboardService: class { myEvents = service.myEvents; composition = service.composition; todo = service.todo; attendance = service.attendance; answer = service.answer; } }));

import { dashboardRoutes } from './dashboard.controller.js';

beforeEach(() => {
  for (const fn of Object.values(service)) fn.mockReset();
  service.myEvents.mockResolvedValue({ characters: [], events: [] });
  service.composition.mockResolvedValue([]);
  service.todo.mockResolvedValue({ pendingApprovals: 0 });
  service.attendance.mockResolvedValue({ span: 10, events: 0, players: [] });
});

const get = async (capabilities: string[], url = '/dashboard') => (await buildRouteAppAs(capabilities, dashboardRoutes)).inject({ method: 'GET', url });

describe('GET /dashboard', () => {
  test('a raider gets only their own events', async () => {
    const res = await get([]);

    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json())).toEqual(['me']);
    expect(service.composition).not.toHaveBeenCalled();
    expect(service.attendance).not.toHaveBeenCalled();
  });

  test('an officer with events.manage also gets composition, to do and attendance (last 10 by default)', async () => {
    const res = await get(['events.manage']);

    expect(Object.keys(res.json()).sort()).toEqual(['attendance', 'composition', 'me', 'todo']);
    expect(service.attendance).toHaveBeenCalledWith(10);
    expect(service.todo).toHaveBeenCalledWith(['events.manage']);
  });

  test('roster.approve alone: the to-do list, nothing else', async () => {
    expect(Object.keys((await get(['roster.approve'])).json()).sort()).toEqual(['me', 'todo']);
  });

  test('span: a number of events or the whole season; anything else is a 400', async () => {
    await get(['events.manage'], '/dashboard?span=season');
    expect(service.attendance).toHaveBeenLastCalledWith('season');
    await get(['events.manage'], '/dashboard?span=25');
    expect(service.attendance).toHaveBeenLastCalledWith(25);
    expect((await get(['events.manage'], '/dashboard?span=0')).statusCode).toBe(400);
    expect((await get(['events.manage'], '/dashboard?span=forever')).statusCode).toBe(400);
  });
});

describe('PUT /me/events/:id/answer', () => {
  const put = async (payload: unknown) => (await buildRouteAppAs([], dashboardRoutes)).inject({ method: 'PUT', url: `/me/events/${uuid(1)}/answer`, payload: payload as object });

  test('answers as the signed-in user', async () => {
    const res = await put({ characterId: uuid(2), status: 'LATE', lateMinutes: 20, note: 'traffic' });

    expect(res.statusCode).toBe(204);
    expect(service.answer).toHaveBeenCalledWith(uuid(1), uuid(1), { characterId: uuid(2), status: 'LATE', lateMinutes: 20, note: 'traffic' });
  });

  test.each([
    ['an unknown status', { characterId: uuid(2), status: 'MAYBE' }],
    ['BENCH (an officer call)', { characterId: uuid(2), status: 'BENCH' }],
    ['minutes on IN', { characterId: uuid(2), status: 'IN', lateMinutes: 5 }],
    ['a note too long', { characterId: uuid(2), status: 'IN', note: 'x'.repeat(201) }],
  ])('refuses %s', async (_label, body) => {
    expect((await put(body)).statusCode).toBe(400);
    expect(service.answer).not.toHaveBeenCalled();
  });
});
