import { NotificationAdapter, NotificationPayload } from '../types/notification.types';

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
}
