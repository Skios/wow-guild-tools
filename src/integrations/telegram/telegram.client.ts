import { Telegraf } from 'telegraf';
import { telegramConfig } from '../../config/telegram.js';

export class TelegramClient {
  private bot: Telegraf<any>;

  constructor() {
    this.bot = new Telegraf(telegramConfig.token);
  }

  async sendMessage(chatId: string, text: string, extra: any = {}) {
    return this.bot.telegram.sendMessage(chatId, text, extra);
  }

  async sendInvite(chatId: string, text: string, keyboard: any) {
    return this.bot.telegram.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  }

  private username?: string;

  async getBotUsername() {
    return (this.username ??= (await this.bot.telegram.getMe()).username);
  }

  async setWebhook(url: string) {
    return this.bot.telegram.setWebhook(`${url}/webhooks/telegram`, {
      secret_token: telegramConfig.webhookSecret,
    });
  }

  /** `url` may only be a t.me/<bot>?start=... link: Telegram opens it on the user's device. */
  async answerCallback(callbackQueryId: string, text: string, url?: string) {
    return this.bot.telegram.answerCbQuery(callbackQueryId, text, { show_alert: false, ...(url && { url }) });
  }

  getBot() {
    return this.bot;
  }
}
