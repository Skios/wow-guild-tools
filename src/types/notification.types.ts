import { Event } from '@prisma/client';

export interface NotificationPayload {
  eventId: string;
  eventTitle: string;
  startTime: Date;
  description?: string;
}

export interface PublicationPayload extends NotificationPayload {
  roster: {
    team: string[];
    bench: string[];
  };
}

export interface NotificationAdapter {
  name: string;
  sendInvite(payload: NotificationPayload): Promise<{ success: boolean; error?: string }>;
  publishFinalRoster(payload: PublicationPayload): Promise<{ success: boolean; error?: string }>;
}
