export const telegramConfig = {
  token: process.env.TELEGRAM_BOT_TOKEN || '',
  channelId: process.env.TELEGRAM_CHANNEL_ID || '',
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
};
