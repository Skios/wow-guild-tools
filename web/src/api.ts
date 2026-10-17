import type { CharacterSummary, EventDetail, EventSummary, Meta, NewEvent, RosterSelection } from './types';

const BASE = '/api';
const EVENTS_PAGE = 50;

interface Issue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly issues: Issue[] = []) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiOptions {
  getKey: () => string | null;
  onUnauthorized: () => void;
  fetchImpl?: typeof fetch;
}

async function errorFrom(response: Response): Promise<ApiError> {
  const fallback = `Server error (${response.status})`;
  let body: { error?: unknown; issues?: Issue[] } = {};
  try {
    body = await response.json();
  } catch {
    return new ApiError(fallback, response.status);
  }
  const issues = Array.isArray(body.issues) ? body.issues : [];
  const detail = issues.map(i => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; ');
  const message = detail || (typeof body.error === 'string' ? body.error : fallback);
  return new ApiError(message, response.status, issues);
}

export function createApi({ getKey, onUnauthorized, fetchImpl = fetch }: ApiOptions) {
  async function request<T>(path: string, init: RequestInit = {}, key: string | null = getKey(), session = true): Promise<T> {
    const headers = new Headers(init.headers);
    if (key) headers.set('x-api-key', key);
    if (init.body) headers.set('content-type', 'application/json');

    let response: Response;
    try {
      response = await fetchImpl(`${BASE}${path}`, { ...init, headers });
    } catch {
      throw new ApiError('Cannot reach the server. Is the API running?', 0);
    }

    if (response.status === 401) {
      if (session) onUnauthorized();
      throw new ApiError('Invalid API key', 401);
    }
    if (!response.ok) throw await errorFrom(response);

    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiError('Unexpected response from the server', response.status);
    }
  }

  const send = (method: string, body?: unknown): RequestInit => ({
    method,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

  return {
    /** Validates a key without touching the current session. */
    checkKey: (key: string) => request<{ ok: true }>('/auth/check', {}, key, false),
    getMeta: () => request<Meta>('/meta/wow'),
    listEvents: () => request<EventSummary[]>(`/events?limit=${EVENTS_PAGE}`),
    getEvent: (id: string) => request<EventDetail>(`/events/${encodeURIComponent(id)}`),
    createEvent: (event: NewEvent) => request<EventSummary>('/events', send('POST', event)),
    saveRoster: (id: string, selections: RosterSelection[]) =>
      request<{ success: true }>(`/events/${encodeURIComponent(id)}/roster`, send('PATCH', { selections })),
    publish: (id: string) => request<{ success: true }>(`/events/${encodeURIComponent(id)}/publish`, send('POST')),
    listCharacters: () => request<CharacterSummary[]>('/characters'),
  };
}

export type Api = ReturnType<typeof createApi>;
