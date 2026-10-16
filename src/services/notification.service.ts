import type { NotificationAdapter, NotificationPayload, PublicationPayload } from '../types/notification.types.js';

export class NotificationService {
  private adapters: Map<string, NotificationAdapter> = new Map();

  registerAdapter(adapter: NotificationAdapter) {
    this.adapters.set(adapter.name, adapter);
  }

  async notifyEventCreated(payload: NotificationPayload) {
    const results = [];
    for (const adapter of this.adapters.values()) {
      const result = await adapter.sendInvite(payload);
      results.push({ adapter: adapter.name, ...result });
    }
    return results;
  }

  async publishFinalRoster(payload: PublicationPayload) {
    const results = [];
    for (const adapter of this.adapters.values()) {
      const result = await adapter.publishFinalRoster(payload);
      results.push({ adapter: adapter.name, ...result });
    }
    return results;
  }
}
