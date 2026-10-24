export interface NotificationPayload {
  eventId: string;
  eventTitle: string;
  startTime: Date;
  description?: string | null;
}

export interface PublicationPayload extends NotificationPayload {
  roster: {
    team: string[];
    bench: string[];
  };
  /** Published again after changes: posted as an update. */
  updated?: boolean;
}

export interface DirectMessage {
  text: string;
  /** The event to answer: the channel attaches its answer buttons. Without it the message is information only. */
  eventId?: string;
}

export interface NotificationAdapter {
  name: string;
  sendInvite(payload: NotificationPayload): Promise<{ success: boolean; error?: string }>;
  publishFinalRoster(payload: PublicationPayload): Promise<{ success: boolean; error?: string }>;
  /** Optional: write to one person privately. `platformUserId` is the id on this platform. */
  sendDirect?(platformUserId: string, message: DirectMessage): Promise<{ success: boolean; error?: string }>;
  /** A plain announcement in the guild channel (e.g. an event cancelled). */
  announce?(text: string): Promise<{ success: boolean; error?: string }>;
}
