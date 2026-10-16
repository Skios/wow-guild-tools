import type { NotificationAdapter, NotificationPayload, PublicationPayload } from '../../types/notification.types.js';
import { TelegramClient } from './telegram.client.js';
import { telegramConfig } from '../../config/telegram.js';

export class TelegramAdapter implements NotificationAdapter {
  name = 'telegram';
  private client = new TelegramClient();

  async sendInvite(payload: NotificationPayload): Promise<{ success: boolean; error?: string }> {
    try {
      const text = `📢 *NEW RAID EVENT* 📢\n\n` +
                   `⚔️ *Event*: ${payload.eventTitle}\n` +
                   `⏰ *Start*: ${payload.startTime.toLocaleString()}\n` +
                   `${payload.description ? `📝 *Details*: ${payload.description}\n` : ''}\n` +
                   `Please mark your presence below!`;

      const keyboard = {
        inline_keyboard: [[
          { text: '✅ IN', callback_data: `raid_in_${payload.eventId}` },
          { text: '❌ OUT', callback_data: `raid_out_${payload.eventId}` },
          { text: '❓ TENTATIVE', callback_data: `raid_tent_${payload.eventId}` },
        ]],
      };

      await this.client.sendInvite(telegramConfig.channelId, text, keyboard);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async publishFinalRoster(payload: PublicationPayload): Promise<{ success: boolean; error?: string }> {
    try {
      const text = `🏆 *FINAL ROSTER: ${payload.eventTitle}* 🏆\n` +
                   `---------------------------------\n` +
                   `⚔️ *RAID TEAM*:\n` +
                   `${payload.roster.team.map(c => `• ${c}`).join('\n') || 'Empty'}\n\n` +
                   `🛋️ *BENCH*:\n` +
                   `${payload.roster.bench.map(c => `• ${c}`).join('\n') || 'Empty'}\n` +
                   `---------------------------------\n` +
                   `🚫 Sign-ups are now closed.`;

      await this.client.sendMessage(telegramConfig.channelId, text, { parse_mode: 'Markdown' });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
