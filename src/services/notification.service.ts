import type { DirectMessage, NotificationAdapter, NotificationPayload, PublicationPayload } from '../types/notification.types.js';

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

  async announce(text: string) {
    return this.fanOut(async adapter => (adapter.announce ? adapter.announce(text) : { success: false, error: `${adapter.name} cannot announce` }));
  }

  /** Privately message one person through the channel they signed up with. */
  async sendDirect(platform: string, platformUserId: string, message: DirectMessage): Promise<Result> {
    const adapter = this.adapters.get(platform);
    if (!adapter) return { success: false, error: `No ${platform} channel configured` };
    if (!adapter.sendDirect) return { success: false, error: `${platform} cannot send direct messages` };
    try {
      return await adapter.sendDirect(platformUserId, message);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
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
