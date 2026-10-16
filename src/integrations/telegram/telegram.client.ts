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
      reply_markup: keyboard,
    });
  }

  async setWebhook(url: string) {
    return this.bot.telegram.setWebhook(`${url}/webhooks/telegram`, {
      secret_token: telegramConfig.webhookSecret,
    });
  }

  async answerCallback(callbackQueryId: string, text: string) {
    return this.bot.telegram.answerCbQuery(callbackQueryId, text, { show_alert: false });
  }

  getBot() {
    return this.bot;
  }
}
