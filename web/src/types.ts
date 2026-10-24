import type { RoleTarget } from './roleTarget';
export type ResponseStatus = 'IN' | 'OUT' | 'TENTATIVE' | 'BENCH' | 'LATE';
export type RoleId = 'TANK' | 'HEALER' | 'DPS' | 'RANGED_DPS';

export interface SpecMeta {
  id: string;
  label: string;
  role: RoleId;
}

export interface ClassMeta {
  id: string;
  label: string;
  color: string;
  roles: RoleId[];
  specs: SpecMeta[];
}

export interface Meta {
  classes: ClassMeta[];
  roles: { id: RoleId; label: string }[];
}

export interface RosterCharacter {
  id: string;
  name: string;
  realm: string;
  class: string;
  spec: string | null;
  role: RoleId;
  claimed: boolean;
  username: string | null;
  isMain: boolean;
  /** Spec ids of the same class, ordered 2nd, 3rd...; never the main spec. */
  offSpecs: string[];
  nickname: string | null;
}

export interface RosterEntryInput {
  name: string;
  realm: string;
  class: string;
  spec: string;
  offSpecs: string[];
  nickname: string | null;
}

export interface ResponseCounts {
  in: number;
  out: number;
  tentative: number;
  bench: number;
  late: number;
  confirmed: number;
  noAnswer: number;
}

export interface EventSummary {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  description: string | null;
  isPublished: boolean;
  canceledAt: string | null;
  state: EventState;
  counts: ResponseCounts;
}

/** Another approved character of the same player, which an officer can switch the answer to. */
export interface Alternative {
  id: string;
  name: string;
  class: string;
  spec: string | null;
  role: RoleId;
}

export interface EventResponse {
  id: string;
  characterId: string;
  status: ResponseStatus;
  isConfirmed: boolean;
  arrivalTime: string | null;
  /** The player's note on their answer (e.g. "leaving 30 min early"). */
  note: string | null;
  /** The off-spec an officer set for this event; null = the character's main spec. */
  spec: string | null;
  alternatives: Alternative[];
  character: {
    id: string;
    name: string;
    realm: string;
    class: string;
    spec: string | null;
    role: RoleId;
    isMain: boolean;
    user: { username: string } | null;
    offSpecs: string[];
    nickname: string | null;
  };
}

/** A roster member who has not answered the event yet. */
export interface NoAnswerEntry {
  id: string;
  name: string;
  realm: string;
  class: string;
  spec: string | null;
  role: RoleId;
  username: string | null;
  offSpecs: string[];
  nickname: string | null;
  /** Whether the bot can write to this person privately. */
  reachable: boolean;
}

export interface Reminder {
  id: string;
  minutesBefore: number;
  sentAt: string | null;
}

/** Stored: OPEN, CLOSED (published), CANCELED; from the clock: STARTED, ENDED. */
export type EventState = 'OPEN' | 'CLOSED' | 'CANCELED' | 'STARTED' | 'ENDED';

export interface EventDetail extends Omit<EventSummary, 'counts'> {
  responses: EventResponse[];
  noAnswer: NoAnswerEntry[];
  reminders: Reminder[];
  /** The target in use: the event's own, or the guild default when roleTargetIsDefault. */
  roleTarget: RoleTarget;
  roleTargetIsDefault: boolean;
}

export interface NewEvent {
  title: string;
  startTime: string;
  endTime: string;
  description?: string;
  /** Minutes before the start. */
  reminders?: number[];
}

export interface RosterSelection {
  characterId: string;
  status: ResponseStatus;
  isConfirmed: boolean;
  lateMinutes?: number;
  /** Only when it changed: the off-spec played, or null for the main one. */
  spec?: string | null;
}

export interface MessageResult {
  characterId: string;
  name: string | null;
  status: 'sent' | 'failed' | 'unreachable' | 'unclaimed' | 'unknown';
  error?: string;
}

/** The signed-in account (GET /auth/me). Pages and menu entries follow its capabilities. */
export interface Officer {
  userId: string;
  username: string;
  role: string;
  position: number; // lower = higher rank
  isOwner: boolean;
  capabilities: string[];
  mustChangePassword: boolean; // signed in with a temporary password
}

/** What the Owner sets on a role (POST/PUT /roles). */
export interface RoleInput {
  name: string;
  position: number;
  capabilities: string[];
}

export interface SiteRoleSummary {
  id: string;
  name: string;
  position: number;
  capabilities: string[];
  isOwner: boolean;
  isDefault: boolean;
  users: number;
}

/** A row of the Users page (GET /users). */
export interface Account {
  id: string;
  username: string;
  mustChangePassword: boolean;
  role: { id: string; name: string; position: number; isOwner: boolean } | null;
  characters: { name: string; realm: string; class: string }[];
}

/** One of my characters (GET /me/profile). inRoster false = waiting for an officer's approval. */
export interface MyCharacter {
  id: string;
  name: string;
  realm: string;
  class: string;
  spec: string | null;
  role: RoleId;
  offSpecs: string[];
  isMain: boolean;
  inRoster: boolean;
}

export interface Profile {
  username: string;
  nickname: string | null;
  role: string | null;
  preferredChannel: string | null;
  channels: { telegram: boolean };
  characters: MyCharacter[];
}

export interface ClaimableCharacter {
  id: string;
  name: string;
  realm: string;
  class: string;
  spec: string | null;
}

/** A name suggestion while typing (guild members first, then Raider.IO). */
export interface CharacterSuggestion {
  name: string;
  realm: string;
  class: string | null;
  inGuild: boolean;
}

export interface RosterAccount {
  id: string;
  username: string;
  nickname: string | null;
}

// ---------- Dashboard (GET /dashboard) ----------
export type QuickStatus = 'IN' | 'LATE' | 'TENTATIVE' | 'OUT';
export type Span = number | 'season';

export interface MyCharacterChoice { id: string; name: string; class: string; spec: string | null; role: RoleId }
export interface MyAnswer {
  eventId: string; characterId: string; status: ResponseStatus; isConfirmed: boolean; arrivalTime: string | null; note: string | null;
}
export interface MyEvent { id: string; title: string; startTime: string; endTime: string; isPublished: boolean; state: EventState; answer: MyAnswer | null }
export interface CompositionRow {
  id: string; title: string; startTime: string; state: EventState; confirmed: number; noAnswer: number; nextReminder: string | null;
  byRole: Record<RoleId, number>; roleTarget: RoleTarget;
}
export interface DashboardTodo {
  pendingApprovals?: number;
  toPublish?: { id: string; title: string; startTime: string }[];
  noTelegram?: { id: string; name: string }[];
}
export interface AttendanceRow { id: string; name: string; in: number; late: number; bench: number; out: number; tentative: number; noAnswer: number }
export interface Dashboard {
  me: { characters: MyCharacterChoice[]; events: MyEvent[] };
  composition?: CompositionRow[];
  todo?: DashboardTodo;
  attendance?: { span: Span; events: number; players: AttendanceRow[] };
}
export interface QuickAnswer { characterId: string; status: QuickStatus; lateMinutes?: number; note?: string }
