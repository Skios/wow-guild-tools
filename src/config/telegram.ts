import { getEnv } from './env.js';

export const telegramConfig = {
  get token() { return getEnv().TELEGRAM_BOT_TOKEN; },
  get channelId() { return getEnv().TELEGRAM_CHANNEL_ID; },
  get webhookSecret() { return getEnv().TELEGRAM_WEBHOOK_SECRET; },
};
