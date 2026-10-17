import type { NotificationAdapter, NotificationPayload, PublicationPayload } from '../types/notification.types.js';

type Result = { success: boolean; error?: string };

export class NotificationService {
  private adapters: Map<string, NotificationAdapter> = new Map();

  registerAdapter(adapter: NotificationAdapter) {
    this.adapters.set(adapter.name, adapter);
  }

  async notifyEventCreated(payload: NotificationPayload) {
    return this.fanOut(adapter => adapter.sendInvite(payload));
  }

  async publishFinalRoster(payload: PublicationPayload) {
    return this.fanOut(adapter => adapter.publishFinalRoster(payload));
  }

  // One broken channel must not stop the others.
  private async fanOut(send: (adapter: NotificationAdapter) => Promise<Result>) {
    return Promise.all(
      [...this.adapters.values()].map(async adapter => {
        try {
          return { adapter: adapter.name, ...(await send(adapter)) };
        } catch (error) {
          return { adapter: adapter.name, success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      }),
    );
  }
}
