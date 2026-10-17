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
}

export interface DirectMessage {
  text: string;
  /** The event the message is about; the channel attaches the answer buttons for it. */
  eventId: string;
}

export interface NotificationAdapter {
  name: string;
  sendInvite(payload: NotificationPayload): Promise<{ success: boolean; error?: string }>;
  publishFinalRoster(payload: PublicationPayload): Promise<{ success: boolean; error?: string }>;
  /** Optional: write to one person privately. `platformUserId` is the id on this platform. */
  sendDirect?(platformUserId: string, message: DirectMessage): Promise<{ success: boolean; error?: string }>;
}
