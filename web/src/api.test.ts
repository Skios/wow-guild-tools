import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError, createApi } from './api';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const fetchMock = vi.fn();
const api = () => createApi({ fetchImpl: fetchMock as unknown as typeof fetch });
const call = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n]! as [string, RequestInit];
  return { url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body as string) : undefined, headers: new Headers(init.headers) };
};

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => json({}));
});

describe('requests', () => {
  test('talks to /api and sends no API key', async () => {
    await api().listEvents();

    const { url, headers } = call();
    expect(url).toBe('/api/events?limit=50');
    expect(headers.has('x-api-key')).toBe(false);
  });

  test('sends the current token as a bearer, read fresh for every request', async () => {
    const getToken = vi.fn().mockResolvedValueOnce('t1').mockResolvedValueOnce('t2');
    const signedIn = createApi({ fetchImpl: fetchMock as unknown as typeof fetch, getToken });

    await signedIn.listEvents();
    await signedIn.me();

    expect(call(0).headers.get('authorization')).toBe('Bearer t1');
    expect([call(1).url, call(1).headers.get('authorization')]).toEqual(['/api/auth/me', 'Bearer t2']);
  });

  test('sends no authorization header without a token', async () => {
    await createApi({ fetchImpl: fetchMock as unknown as typeof fetch, getToken: async () => null }).listEvents();
    expect(call().headers.has('authorization')).toBe(false);
  });

  test('still sends the request, without credentials, when the token cannot be read', async () => {
    const getToken = vi.fn().mockRejectedValue(new Error('storage blocked'));
    await createApi({ fetchImpl: fetchMock as unknown as typeof fetch, getToken }).listEvents();
    expect(call().headers.has('authorization')).toBe(false);
  });

  test('sends JSON bodies with the right content type', async () => {
    const body = { title: 'Raid', startTime: 'a', endTime: 'b' };

    await api().createEvent(body);

    const { url, method, headers, body: sent } = call();
    expect([url, method]).toEqual(['/api/events', 'POST']);
    expect(headers.get('content-type')).toBe('application/json');
    expect(sent).toEqual(body);
  });

  test('saves the roster with PATCH and publishes with POST, encoding the id', async () => {
    await api().saveRoster('e 1', [{ characterId: 'c1', status: 'LATE', isConfirmed: true, lateMinutes: 15 }]);
    await api().publish('e 1');

    expect(call(0)).toMatchObject({ url: '/api/events/e%201/roster', method: 'PATCH', body: { selections: [{ characterId: 'c1', status: 'LATE', isConfirmed: true, lateMinutes: 15 }] } });
    expect(call(1)).toMatchObject({ url: '/api/events/e%201/publish', method: 'POST' });
  });

  test('messages people, with or without custom text', async () => {
    await api().message('e1', ['c1', 'c2'], 'Where are you?');
    await api().message('e1', ['c1']);

    expect(call(0)).toMatchObject({ url: '/api/events/e1/message', method: 'POST', body: { characterIds: ['c1', 'c2'], text: 'Where are you?' } });
    expect(call(1).body).toEqual({ characterIds: ['c1'] });
  });

  test('loads one event with an encoded id', async () => {
    await api().getEvent('a/b c');
    expect(call().url).toBe('/api/events/a%2Fb%20c');
  });

  test('lists characters and game data', async () => {
    fetchMock.mockImplementation(async () => json([{ id: 'c1' }]));
    await expect(api().listCharacters()).resolves.toEqual([{ id: 'c1' }]);
    await api().getMeta();
    expect(call(0).url).toBe('/api/characters');
    expect(call(1).url).toBe('/api/meta/wow');
  });

  test('manages the raid roster', async () => {
    const entry = { name: 'Brannock', realm: 'Silvermoon', class: 'WARRIOR', spec: 'PROTECTION' };

    await api().listRoster();
    await api().addToRoster(entry);
    await api().updateRosterEntry('c 1', entry);
    await api().removeFromRoster('c 1');
    await api().releaseRosterEntry('c 1');

    expect([0, 1, 2, 3, 4].map(n => `${call(n).method} ${call(n).url}`)).toEqual([
      'GET /api/roster',
      'POST /api/roster',
      'PUT /api/roster/c%201',
      'DELETE /api/roster/c%201',
      'POST /api/roster/c%201/release',
    ]);
    expect(call(1).body).toEqual(entry);
    expect(call(3).headers.has('content-type')).toBe(false);
  });
});

describe('errors', () => {
  test('a 401 signs out and says the session ended', async () => {
    fetchMock.mockImplementation(async () => json({ error: 'Unauthorized' }, 401));
    const onUnauthorized = vi.fn();

    const error = await createApi({ fetchImpl: fetchMock as unknown as typeof fetch, onUnauthorized }).listEvents().catch(e => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.message).toMatch(/sign in again/i);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  test('a 401 is still an error when nobody listens', async () => {
    fetchMock.mockImplementation(async () => json({}, 401));
    await expect(api().listEvents()).rejects.toMatchObject({ status: 401 });
  });

  test('a 403 says the account is not an officer, whatever the server wrote', async () => {
    fetchMock.mockImplementation(async () => json({ error: 'Forbidden' }, 403));
    const onUnauthorized = vi.fn();

    const error = await createApi({ fetchImpl: fetchMock as unknown as typeof fetch, onUnauthorized }).publish('e1').catch(e => e);

    expect(error).toMatchObject({ status: 403, message: 'This account is not an officer.' });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  test('uses the server message', async () => {
    fetchMock.mockImplementation(async () => json({ error: 'Event already published' }, 409));

    const error = await api().publish('e1').catch(e => e);

    expect(error.message).toBe('Event already published');
    expect(error.status).toBe(409);
  });

  test('turns validation issues into a readable list', async () => {
    fetchMock.mockImplementation(async () =>
      json({ error: 'Invalid request', issues: [{ path: 'title', message: 'Title is required' }, { path: '', message: 'Bad body' }] }, 400),
    );

    const error = await api().createEvent({} as never).catch(e => e);

    expect(error.message).toBe('title: Title is required; Bad body');
    expect(error.issues).toHaveLength(2);
  });

  test('a proxy error page (not JSON) becomes a generic message', async () => {
    fetchMock.mockImplementation(async () => new Response('<html>Bad gateway</html>', { status: 502 }));

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
    fetchMock.mockImplementation(async () => new Response('not json', { status: 200 }));
    await expect(api().listEvents()).rejects.toThrow(/unexpected response/i);
  });

  test('an error body that is JSON but has no message still yields an error', async () => {
    fetchMock.mockImplementation(async () => json({ foo: 1 }, 500));
    await expect(api().listEvents()).rejects.toThrow('Server error (500)');
  });
});
