import type {
  Account, CharacterSummary, EventDetail, SiteRoleSummary, EventSummary, Meta, MessageResult, NewEvent, Officer, RosterCharacter, RosterEntryInput, RosterSelection,
} from './types';

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

/** Open sign-up (no login): POST /api/signup. Throws an ApiError with the server's reason. */
export async function signupRequest(username: string, password: string, link?: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(`${BASE}/signup`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password, ...(link && { link }) }),
    });
  } catch {
    throw new ApiError('Cannot reach the server. Try again in a moment.', 0);
  }
  if (response.status === 429) throw new ApiError('Too many sign-ups from here. Try again later.', 429);
  if (!response.ok) throw await errorFrom(response);
}

interface ApiOptions {
  fetchImpl?: typeof fetch;
  /** The current access token, asked for on every request so a refreshed one is used. */
  getToken?: () => Promise<string | null>;
  /** Called when the server rejects the token (expired or revoked). */
  onUnauthorized?: () => void;
}

export function createApi({ fetchImpl = fetch, getToken = async () => null, onUnauthorized }: ApiOptions = {}) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body) headers.set('content-type', 'application/json');
    const token = await getToken().catch(() => null);
    if (token) headers.set('authorization', `Bearer ${token}`);

    let response: Response;
    try {
      response = await fetchImpl(`${BASE}${path}`, { ...init, headers });
    } catch {
      throw new ApiError('Cannot reach the server. Is the API running?', 0);
    }

    if (response.status === 401) {
      onUnauthorized?.();
      throw new ApiError('Your session has ended. Please sign in again.', 401);
    }
    if (response.status === 403) throw new ApiError('Your account does not have access to this.', 403);
    if (!response.ok) throw await errorFrom(response);
    if (response.status === 204) return undefined as T;

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
  const id = encodeURIComponent;

  return {
    me: () => request<Officer>('/auth/me'),
    getMeta: () => request<Meta>('/meta/wow'),
    listEvents: () => request<EventSummary[]>(`/events?limit=${EVENTS_PAGE}`),
    getEvent: (eventId: string) => request<EventDetail>(`/events/${id(eventId)}`),
    createEvent: (event: NewEvent) => request<EventSummary>('/events', send('POST', event)),
    saveRoster: (eventId: string, selections: RosterSelection[]) =>
      request<{ success: true }>(`/events/${id(eventId)}/roster`, send('PATCH', { selections })),
    publish: (eventId: string) => request<{ success: true }>(`/events/${id(eventId)}/publish`, send('POST')),
    message: (eventId: string, characterIds: string[], text?: string) =>
      request<{ results: MessageResult[] }>(`/events/${id(eventId)}/message`, send('POST', { characterIds, ...(text && { text }) })),
    listCharacters: () => request<CharacterSummary[]>('/characters'),

    listRoster: () => request<RosterCharacter[]>('/roster'),
    addToRoster: (entry: RosterEntryInput) => request<RosterCharacter>('/roster', send('POST', entry)),
    updateRosterEntry: (characterId: string, entry: RosterEntryInput) =>
      request<RosterCharacter>(`/roster/${id(characterId)}`, send('PUT', entry)),
    removeFromRoster: (characterId: string) => request<{ success: true }>(`/roster/${id(characterId)}`, send('DELETE')),
    releaseRosterEntry: (characterId: string) => request<RosterCharacter>(`/roster/${id(characterId)}/release`, send('POST')),

    listUsers: () => request<Account[]>('/users'),
    listRoles: () => request<SiteRoleSummary[]>('/roles'),
    setUserRole: (userId: string, roleId: string) => request<void>(`/users/${id(userId)}/role`, send('PUT', { roleId })),
    resetUserPassword: (userId: string) => request<{ password: string }>(`/users/${id(userId)}/password-reset`, send('POST')),
    telegramStatus: () => request<{ linked: boolean }>('/me/telegram'),
    telegramBotLink: () => request<{ url: string }>('/me/telegram/bot-link', send('POST')),
    linkTelegram: (token: string) => request<void>('/me/telegram', send('POST', { token })),
    unlinkTelegram: () => request<void>('/me/telegram', send('DELETE')),
    changePassword: (currentPassword: string, password: string) =>
      request<void>('/auth/password', send('POST', { currentPassword, password })),
  };
}

export type Api = ReturnType<typeof createApi>;
