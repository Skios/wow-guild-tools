import type { DirectMessage, NotificationAdapter, NotificationPayload, PublicationPayload } from '../../types/notification.types.js';
import { TelegramClient } from './telegram.client.js';
import { telegramConfig } from '../../config/telegram.js';

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const answerButtons = (eventId: string) => [
  { text: '✅ IN', callback_data: `raid_in_${eventId}` },
  { text: '⏰ LATE', callback_data: `raid_late_${eventId}` },
  { text: '❓ TENTATIVE', callback_data: `raid_tent_${eventId}` },
  { text: '❌ OUT', callback_data: `raid_out_${eventId}` },
];

export class TelegramAdapter implements NotificationAdapter {
  name = 'telegram';
  private client = new TelegramClient();

  async sendInvite(payload: NotificationPayload): Promise<{ success: boolean; error?: string }> {
    try {
      const text = `📢 <b>NEW RAID EVENT</b> 📢\n\n` +
                   `⚔️ <b>Event</b>: ${escapeHtml(payload.eventTitle)}\n` +
                   `⏰ <b>Start</b>: ${payload.startTime.toLocaleString()}\n` +
                   `${payload.description ? `📝 <b>Details</b>: ${escapeHtml(payload.description)}\n` : ''}\n` +
                   `Please mark your presence below!`;

      const botUsername = await this.client.getBotUsername();
      const keyboard = {
        inline_keyboard: [
          answerButtons(payload.eventId),
          [{ text: '📝 Register your character', url: `https://t.me/${botUsername}?start=register` }],
        ],
      };

      await this.client.sendInvite(telegramConfig.channelId, text, keyboard);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async publishFinalRoster(payload: PublicationPayload): Promise<{ success: boolean; error?: string }> {
    try {
      const list = (names: string[]) => names.map(c => `• ${escapeHtml(c)}`).join('\n') || 'Empty';
      const text = `🏆 <b>FINAL ROSTER: ${escapeHtml(payload.eventTitle)}</b> 🏆\n` +
                   `---------------------------------\n` +
                   `⚔️ <b>RAID TEAM</b>:\n${list(payload.roster.team)}\n\n` +
                   `🛋️ <b>BENCH</b>:\n${list(payload.roster.bench)}\n` +
                   `---------------------------------\n` +
                   `🚫 Sign-ups are now closed.`;

      await this.client.sendMessage(telegramConfig.channelId, text, { parse_mode: 'HTML' });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async sendDirect(platformUserId: string, message: DirectMessage): Promise<{ success: boolean; error?: string }> {
    try {
      await this.client.sendMessage(platformUserId, escapeHtml(message.text), {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [answerButtons(message.eventId)] },
      });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
