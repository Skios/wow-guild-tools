import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError, createApi } from './api';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const fetchMock = vi.fn();
const onUnauthorized = vi.fn();
const api = () => createApi({ getKey: () => 'secret-key', onUnauthorized, fetchImpl: fetchMock as unknown as typeof fetch });

beforeEach(() => {
  fetchMock.mockReset();
  onUnauthorized.mockReset();
});

describe('requests', () => {
  test('sends the API key on every call, under /api', async () => {
    fetchMock.mockResolvedValue(json([]));

    await api().listEvents();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/events?limit=50');
    expect(new Headers(init.headers).get('x-api-key')).toBe('secret-key');
  });

  test('sends JSON bodies with the right content type', async () => {
    fetchMock.mockResolvedValue(json({ id: 'e1' }, 201));
    const body = { title: 'Raid', startTime: 'a', endTime: 'b', createdByUserId: 'u' };

    await api().createEvent(body);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/events');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual(body);
  });

  test('saves the roster with PATCH and publishes with POST', async () => {
    fetchMock.mockImplementation(async () => json({ success: true }));

    await api().saveRoster('e 1', [{ characterId: 'c1', status: 'IN', isConfirmed: true }]);
    await api().publish('e 1');

    expect(fetchMock.mock.calls[0]![0]).toBe('/api/events/e%201/roster');
    expect(fetchMock.mock.calls[0]![1].method).toBe('PATCH');
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/events/e%201/publish');
    expect(fetchMock.mock.calls[1]![1].method).toBe('POST');
  });

  test('lists characters', async () => {
    fetchMock.mockResolvedValue(json([{ id: 'c1' }]));

    await expect(api().listCharacters()).resolves.toEqual([{ id: 'c1' }]);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/characters');
  });

  test('loads one event with an encoded id', async () => {
    fetchMock.mockResolvedValue(json({ id: 'a b' }));

    await api().getEvent('a/b c');

    expect(fetchMock.mock.calls[0]![0]).toBe('/api/events/a%2Fb%20c');
  });

  test('checkKey validates the key it is given, not the stored one', async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));

    await api().checkKey('candidate');

    expect(new Headers(fetchMock.mock.calls[0]![1].headers).get('x-api-key')).toBe('candidate');
  });

  test('returns parsed JSON', async () => {
    fetchMock.mockResolvedValue(json({ classes: [], roles: [] }));
    await expect(api().getMeta()).resolves.toEqual({ classes: [], roles: [] });
  });
});

describe('errors', () => {
  test('401 clears the session and says the key is wrong', async () => {
    fetchMock.mockResolvedValue(json({ error: 'Unauthorized' }, 401));

    const error = await api().listEvents().catch(e => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.message).toMatch(/api key/i);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  test('checkKey with a wrong key does not log the current session out', async () => {
    fetchMock.mockResolvedValue(json({ error: 'Unauthorized' }, 401));

    await expect(api().checkKey('wrong')).rejects.toThrow(/api key/i);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  test('uses the server message', async () => {
    fetchMock.mockResolvedValue(json({ error: 'Event already published' }, 409));

    const error = await api().publish('e1').catch(e => e);

    expect(error.message).toBe('Event already published');
    expect(error.status).toBe(409);
  });

  test('turns validation issues into a readable list', async () => {
    fetchMock.mockResolvedValue(
      json({ error: 'Invalid request', issues: [{ path: 'title', message: 'Title is required' }, { path: '', message: 'Bad body' }] }, 400),
    );

    const error = await api().createEvent({} as never).catch(e => e);

    expect(error.message).toBe('title: Title is required; Bad body');
    expect(error.issues).toHaveLength(2);
  });

  test('a proxy error page (not JSON) becomes a generic message', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));

    const error = await api().listEvents().catch(e => e);

    expect(error.status).toBe(502);
    expect(error.message).toBe('Server error (502)');
    expect(error.message).not.toContain('<html>');
  });

  test('an unreachable server is reported as such', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await api().listEvents().catch(e => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.message).toMatch(/reach the server/i);
  });

  test('a 200 with a broken body is an error, not a crash', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }));

    await expect(api().listEvents()).rejects.toThrow(/unexpected response/i);
  });

  test('an error body that is JSON but has no message still yields an error', async () => {
    fetchMock.mockResolvedValue(json({ foo: 1 }, 500));

    await expect(api().listEvents()).rejects.toThrow('Server error (500)');
  });
});
