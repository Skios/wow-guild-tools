// Points the bot at the API (once per environment, or after changing the bot token or the secret):
//   npm run telegram:webhook:dev -- https://<api-of-that-environment>.vercel.app
// Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from the env file, so no secret is typed or pasted.
const [apiOrigin] = process.argv.slice(2);
const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret } = process.env;
const call = async (method: string, body?: object) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}),
  });
  return (await res.json()) as { ok: boolean; description?: string; result?: Record<string, unknown> };
};

try {
  if (!token || !secret) throw new Error('Add TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET (same values as on Vercel) to the env file');
  if (!apiOrigin || !URL.canParse(apiOrigin) || !apiOrigin.startsWith('https://')) throw new Error('Usage: npm run telegram:webhook:dev -- https://<api>.vercel.app');
  const health = await fetch(new URL('/api/health', apiOrigin)).catch(() => null);
  if (!health?.ok) throw new Error(`${apiOrigin}/api/health does not answer: is that the API of this environment?`);

  const url = new URL('/api/webhooks/telegram', apiOrigin).toString();
  const set = await call('setWebhook', { url, secret_token: secret, drop_pending_updates: true, allowed_updates: ['message', 'callback_query'] });
  if (!set.ok) throw new Error(`Telegram refused: ${set.description ?? 'unknown error'}`);
  const info = await call('getWebhookInfo');
  console.log(`Webhook set: ${String(info.result?.url)} (pending updates dropped)`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
