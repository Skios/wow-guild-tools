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

export interface CharacterSummary {
  id: string;
  userId: string | null;
  name: string;
  realm: string;
  class: string;
  spec: string | null;
  role: RoleId;
  isMain: boolean;
  username: string | null;
  /** Not sent by every endpoint. */
  offSpecs?: string[];
  nickname?: string | null;
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
  counts: ResponseCounts;
}

export interface EventResponse {
  id: string;
  characterId: string;
  status: ResponseStatus;
  isConfirmed: boolean;
  arrivalTime: string | null;
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

export interface EventDetail extends Omit<EventSummary, 'counts'> {
  responses: EventResponse[];
  noAnswer: NoAnswerEntry[];
}

export interface NewEvent {
  title: string;
  startTime: string;
  endTime: string;
  description?: string;
}

export interface RosterSelection {
  characterId: string;
  status: ResponseStatus;
  isConfirmed: boolean;
  lateMinutes?: number;
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
  capabilities: string[];
}
