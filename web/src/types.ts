export type ResponseStatus = 'IN' | 'OUT' | 'TENTATIVE' | 'BENCH';
export type RoleId = 'TANK' | 'HEALER' | 'DPS' | 'RANGED_DPS';

export interface ClassMeta {
  id: string;
  label: string;
  color: string;
  roles: RoleId[];
}

export interface Meta {
  classes: ClassMeta[];
  roles: { id: RoleId; label: string }[];
}

export interface CharacterSummary {
  id: string;
  userId: string;
  name: string;
  realm: string;
  class: string;
  role: RoleId;
  isMain: boolean;
  username: string;
}

export interface ResponseCounts {
  in: number;
  out: number;
  tentative: number;
  bench: number;
  confirmed: number;
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
  character: {
    id: string;
    name: string;
    realm: string;
    class: string;
    role: RoleId;
    isMain: boolean;
    user: { username: string };
  };
}

export interface EventDetail extends Omit<EventSummary, 'counts'> {
  responses: EventResponse[];
}

export interface NewEvent {
  title: string;
  startTime: string;
  endTime: string;
  description?: string;
  createdByUserId: string;
}

export interface RosterSelection {
  characterId: string;
  status: ResponseStatus;
  isConfirmed: boolean;
}
